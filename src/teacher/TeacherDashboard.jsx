// Teacher dashboard — ported from the old teacher.html (gotchigarden repo),
// core roster + points loop only for this first pass. Left out on purpose,
// to be ported later: Google auth (no login gate here yet), CSV roster
// import, prices panel, seating plan designer, photo/card export.
//
// Data layer is local state persisted to localStorage, NOT Supabase — see
// CLAUDE.md: don't touch/reintroduce Supabase until explicitly asked. The
// shape below (classes -> students -> {id, name, email, gotchiPts,
// lifetimePts, pets}) mirrors the old Supabase schema on purpose so
// swapping in a real backend later is a matter of replacing the load/save
// functions, not redesigning the data model or components.
//
// gotchiPts vs lifetimePts: gotchiPts is a spendable currency balance —
// it goes up on award and down on deduction/spend (a future item shop
// spends this same balance). lifetimePts is the total ever earned and
// only ever goes up; it's what actually drives the growth meter
// (growth.js's applyPointsToGrowth/meterFraction), so deducting or
// spending gotchiPts can never shrink or un-advance a pet's growth — see
// applyPtsChange below for exactly how the two stay in sync.

import { useEffect, useRef, useState } from 'react';
import './teacher.css';
import { newStudentProgress, applyPointsToGrowth, meterFraction, findTamaName, POINTS_PER_GROWTH } from '../game/growth.js';

const STORAGE_KEY = 'marigold-teacher-data-v1';

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { classes: [], currentClassId: null };
    const parsed = JSON.parse(raw);
    return {
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
      currentClassId: parsed.currentClassId ?? null,
    };
  } catch {
    return { classes: [], currentClassId: null }; // corrupted/blocked storage — start fresh rather than crash
  }
}

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function TeacherDashboard() {
  const initialStore = useState(loadStore)[0];
  const [classes, setClasses] = useState(initialStore.classes);
  const [currentClassId, setCurrentClassId] = useState(initialStore.currentClassId);
  const [search, setSearch] = useState('');
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentPts, setNewStudentPts] = useState(0);
  const [showAwardBanner, setShowAwardBanner] = useState(false);
  const [awardAmount, setAwardAmount] = useState(1);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);

  // Persist on every change. Local-only for now — see file header.
  // currentClassId is saved too so the island view (a separate page reading
  // the same storage key) knows which class is "live"/being projected,
  // without needing its own selection UI.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ classes, currentClassId }));
    } catch {
      // storage full/blocked (private window etc.) — data still works for
      // this session, just won't survive a reload; not worth surfacing an
      // error for
    }
  }, [classes, currentClassId]);

  function toast(msg) {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2200);
  }

  const currentClass = classes.find((c) => c.id === currentClassId) ?? null;
  const students = currentClass?.students ?? [];
  const filteredStudents = students.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const studentCount = students.length;
  const topPts = studentCount ? Math.max(...students.map((s) => s.gotchiPts)) : 0;
  const avgPts = studentCount ? Math.round(students.reduce((sum, s) => sum + s.gotchiPts, 0) / studentCount) : 0;

  function updateCurrentClassStudents(updater) {
    setClasses((prev) => prev.map((c) => (c.id === currentClassId ? { ...c, students: updater(c.students) } : c)));
  }

  function createClass() {
    const name = newClassName.trim();
    if (!name) return;
    const cls = { id: uid(), name, students: [] };
    setClasses((prev) => [...prev, cls]);
    setCurrentClassId(cls.id);
    setNewClassName('');
    setShowNewClassForm(false);
    setSearch('');
    toast(`Created ${name}`);
  }

  function selectClass(id) {
    setCurrentClassId(id);
    setSearch('');
  }

  function openAddStudent() {
    setNewStudentName('');
    setNewStudentEmail('');
    setNewStudentPts(0);
    setShowAddStudent(true);
  }

  function createStudent() {
    const name = newStudentName.trim();
    if (!name) return;
    const startingPts = Math.max(0, Number(newStudentPts) || 0);
    // A brand-new student's starting balance counts as already-earned —
    // gotchiPts and lifetimePts both start equal, same as applyPtsChange
    // would treat an increase from 0.
    const { progress: growth, reachedAdultTamaIds } = applyPointsToGrowth(newStudentProgress(), startingPts);
    const student = {
      id: uid(),
      name,
      email: newStudentEmail.trim(),
      gotchiPts: startingPts,
      lifetimePts: startingPts,
      pets: [], // legacy field from teacher.html's old shop system — unused now, kept only so existing saved data doesn't break; growth/tamadex live in `growth` instead
      growth,
      // 'current' = follow whatever's growing now, UNTIL the first adult is
      // reached — then it pins to that adult and stops auto-advancing (see
      // applyPtsChange below); a specific tamadex tamaId always shows that
      // completed adult instead. Handles the unlikely case of enough
      // starting points to reach an adult immediately.
      displayTamaId: reachedAdultTamaIds.at(-1) ?? 'current',
    };
    updateCurrentClassStudents((list) => [...list, student]);
    setShowAddStudent(false);
    toast(`Added ${name}`);
  }

  function removeStudent(student) {
    if (!confirm(`Remove ${student.name}? This cannot be undone.`)) return;
    updateCurrentClassStudents((list) => list.filter((s) => s.id !== student.id));
    toast('Student removed');
  }

  // Sets a student's gotchiPts (the spendable currency balance) to
  // newGotchiPts, and separately tracks lifetimePts (total ever earned,
  // never decreases) which is what actually drives growth — see the file
  // header comment. Only the earned PORTION of an increase counts toward
  // lifetimePts: raising gotchiPts from 5 to 8 adds 3 to lifetimePts (an
  // award), but lowering it from 8 to 5 (a deduction, or a future shop
  // spend) adds nothing — lifetimePts, and therefore the growth meter and
  // stage, is untouched. This is how "spending points doesn't deplete the
  // meter" is actually enforced, not just documented.
  //
  // Bug fix (pre-dates the currency/lifetime split, still applies): the
  // field used to visibly jump to whatever was growing on EVERY stage
  // change (egg->baby->...->adult->egg again next cycle), since
  // displayTamaId defaulted to 'current' and nothing ever moved it off
  // that. Now: still auto-follow while displayTamaId is 'current' (so the
  // field shows the pet actually growing, same as before) — but the
  // moment an adult is newly reached, pin displayTamaId to it so the field
  // stops advancing there instead of quietly cycling on to the next egg.
  // Only an explicit tamadex pick (setDisplayTama) moves it after that.
  function applyPtsChange(student, newGotchiPts) {
    const gotchiPts = Math.max(0, Number(newGotchiPts) || 0);
    const priorGotchiPts = student.gotchiPts ?? 0;
    // Migration fallback: students saved before this split only have
    // gotchiPts, which (under the old single-number model) already fully
    // reflected everything they'd earned — so treat that as their starting
    // lifetimePts rather than resetting their meter to 0.
    const priorLifetimePts = student.lifetimePts ?? priorGotchiPts;
    const earnedDelta = Math.max(0, gotchiPts - priorGotchiPts);
    const lifetimePts = priorLifetimePts + earnedDelta;

    const { progress: growth, reachedAdultTamaIds } = applyPointsToGrowth(student.growth ?? newStudentProgress(), lifetimePts);
    const stillAutoFollowing = !student.displayTamaId || student.displayTamaId === 'current';
    const displayTamaId = stillAutoFollowing && reachedAdultTamaIds.length > 0 ? reachedAdultTamaIds.at(-1) : student.displayTamaId;
    return { ...student, gotchiPts, lifetimePts, growth, displayTamaId };
  }

  function setStudentPts(studentId, newPts) {
    updateCurrentClassStudents((list) => list.map((s) => (s.id === studentId ? applyPtsChange(s, newPts) : s)));
  }

  // displayTamaId is 'current' (follow whatever's growing) or a specific
  // tamadex tamaId — GAME_DESIGN.md: a student can display either the tama
  // they're currently growing or any adult they've already completed and
  // logged. Set here on the teacher side for now since there's no
  // student-facing app yet to let them pick it themselves.
  function setDisplayTama(studentId, displayTamaId) {
    updateCurrentClassStudents((list) => list.map((s) => (s.id === studentId ? { ...s, displayTamaId } : s)));
  }

  function nudgePts(student, delta) {
    setStudentPts(student.id, student.gotchiPts + delta);
  }

  function awardAll(sign) {
    const amt = Math.max(1, Number(awardAmount) || 1) * sign;
    updateCurrentClassStudents((list) => list.map((s) => applyPtsChange(s, s.gotchiPts + amt)));
    toast(sign > 0 ? `Awarded ${amt} pts to everyone` : `Deducted ${Math.abs(amt)} pts from everyone`);
  }

  return (
    <div className="teacher-root">
      <header className="teacher-header">
        <div className="teacher-logo">★ MARIGOLD CORE</div>
        <div className="teacher-hdr-sep" />
        <div className="teacher-hdr-class-label">{currentClass ? currentClass.name : 'No class selected'}</div>
      </header>

      <div className="teacher-main-layout">
        <div className="teacher-sidebar">
          <div className="teacher-sidebar-section">
            <div className="teacher-sidebar-head">Classes</div>
            {classes.map((cls) => (
              <button
                key={cls.id}
                className={`teacher-class-btn${cls.id === currentClassId ? ' active' : ''}`}
                onClick={() => selectClass(cls.id)}
              >
                {cls.name}
              </button>
            ))}

            {showNewClassForm ? (
              <div className="teacher-new-class-form">
                <input
                  type="text"
                  placeholder="Class name"
                  value={newClassName}
                  autoFocus
                  onChange={(e) => setNewClassName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createClass();
                    if (e.key === 'Escape') setShowNewClassForm(false);
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="teacher-btn green" style={{ flex: 1 }} onClick={createClass}>
                    Create
                  </button>
                  <button className="teacher-btn" onClick={() => setShowNewClassForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="teacher-btn-new-class" onClick={() => setShowNewClassForm(true)}>
                + New Class
              </button>
            )}
          </div>

          {currentClass && (
            <div className="teacher-sidebar-stats">
              <div className="teacher-sidebar-head">Class Stats</div>
              <div className="teacher-stat-row">
                <span className="teacher-stat-label">Students</span>
                <span className="teacher-stat-value">{studentCount}</span>
              </div>
              <div className="teacher-stat-row">
                <span className="teacher-stat-label">Top pts</span>
                <span className="teacher-stat-value">{topPts}</span>
              </div>
              <div className="teacher-stat-row">
                <span className="teacher-stat-label">Avg pts</span>
                <span className="teacher-stat-value">{avgPts}</span>
              </div>
            </div>
          )}
        </div>

        <div className="teacher-content">
          {!currentClass ? (
            <div className="teacher-empty-state">
              <div className="teacher-empty-icon">★</div>
              <div className="teacher-empty-text">Select or create a class to begin</div>
            </div>
          ) : (
            <>
              <div className="teacher-toolbar">
                <input
                  type="text"
                  placeholder="Search students..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="teacher-btn-flex" />
                <button className="teacher-btn green" onClick={openAddStudent}>
                  + Add Student
                </button>
                <button className="teacher-btn yellow" onClick={() => setShowAwardBanner(true)}>
                  ★ Award All
                </button>
              </div>

              {filteredStudents.length === 0 ? (
                <div className="teacher-empty-state">
                  <div className="teacher-empty-text">
                    {search ? 'No students match your search' : 'No students yet — add one to get started'}
                  </div>
                </div>
              ) : (
                <div className="teacher-student-grid">
                  {filteredStudents.map((s) => (
                    <div className="teacher-student-card" key={s.id}>
                      <div className="teacher-student-name">{s.name}</div>
                      <div className="teacher-pts-controls">
                        <button className="teacher-pts-btn minus" onClick={() => nudgePts(s, -10)} title="-10">
                          −
                        </button>
                        <button className="teacher-pts-btn minus" style={{ fontSize: 8 }} onClick={() => nudgePts(s, -1)} title="-1">
                          -1
                        </button>
                        <input
                          className="teacher-pts-input"
                          type="number"
                          value={s.gotchiPts}
                          min={0}
                          onChange={(e) => setStudentPts(s.id, e.target.value)}
                        />
                        <button
                          className="teacher-pts-btn plus"
                          style={{ fontSize: 8, borderColor: 'var(--green)', color: 'var(--green)' }}
                          onClick={() => nudgePts(s, 1)}
                          title="+1"
                        >
                          +1
                        </button>
                        <button className="teacher-pts-btn plus" onClick={() => nudgePts(s, 10)} title="+10">
                          +
                        </button>
                      </div>
                      <GrowthStatus student={s} onSetDisplayTama={(tamaId) => setDisplayTama(s.id, tamaId)} />
                      <button className="teacher-student-remove" onClick={() => removeStudent(s)}>
                        ✕ Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {showAwardBanner && (
                <div className="teacher-award-banner">
                  <label>Award all students:</label>
                  <input
                    type="number"
                    value={awardAmount}
                    min={1}
                    max={9999}
                    onChange={(e) => setAwardAmount(e.target.value)}
                  />
                  <label>pts</label>
                  <button className="teacher-btn yellow" onClick={() => awardAll(1)}>
                    ★ Award
                  </button>
                  <button className="teacher-btn red" onClick={() => awardAll(-1)}>
                    − Deduct
                  </button>
                  <div className="teacher-btn-flex" />
                  <button className="teacher-btn" onClick={() => setShowAwardBanner(false)}>
                    ✕
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showAddStudent && (
        <div className="teacher-modal-backdrop open" onClick={(e) => e.target === e.currentTarget && setShowAddStudent(false)}>
          <div className="teacher-modal">
            <div className="teacher-modal-title">Add Student</div>
            <div className="teacher-field">
              <label>Name *</label>
              <input
                type="text"
                placeholder="e.g. Alice"
                value={newStudentName}
                autoFocus
                onChange={(e) => setNewStudentName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createStudent()}
              />
            </div>
            <div className="teacher-field">
              <label>Email (optional)</label>
              <input
                type="text"
                placeholder="student@school.com"
                value={newStudentEmail}
                onChange={(e) => setNewStudentEmail(e.target.value)}
              />
            </div>
            <div className="teacher-field">
              <label>Starting GotchiPts</label>
              <input type="number" min={0} value={newStudentPts} onChange={(e) => setNewStudentPts(e.target.value)} />
            </div>
            <div className="teacher-modal-btns">
              <button className="teacher-btn" onClick={() => setShowAddStudent(false)}>
                Cancel
              </button>
              <button className="teacher-btn green" onClick={createStudent}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="teacher-toast" className={toastMsg ? 'show' : ''}>
        {toastMsg}
      </div>
    </div>
  );
}

// Falls back to a fresh (0-progress) growth record for students saved
// before growth tracking existed, so old localStorage data doesn't crash
// the dashboard — doesn't persist the fallback, just renders safely.
function GrowthStatus({ student, onSetDisplayTama }) {
  const growth = student.growth ?? newStudentProgress();
  const fraction = meterFraction(growth, student.lifetimePts ?? student.gotchiPts);
  const { stage, name } = growth.currentTama;

  const displayTamaId = student.displayTamaId ?? 'current';
  const displayName = displayTamaId === 'current' ? name : (findTamaName(displayTamaId) ?? name);

  return (
    <div className="teacher-growth-status">
      <div className="teacher-growth-label">
        {stage} · {name}
      </div>
      <div className="teacher-growth-meter" title={`${Math.round(fraction * POINTS_PER_GROWTH)}/${POINTS_PER_GROWTH} pts to next stage`}>
        <div className="teacher-growth-meter-fill" style={{ width: `${fraction * 100}%` }} />
      </div>
      <div className="teacher-display-tama">Current Display Tama: {displayName}</div>
      {growth.tamadex.length > 0 && (
        <select
          className="teacher-display-tama-select"
          value={displayTamaId}
          onChange={(e) => onSetDisplayTama(e.target.value === 'current' ? 'current' : Number(e.target.value))}
        >
          <option value="current">Currently growing ({stage} · {name})</option>
          {growth.tamadex.map((tamaId) => (
            <option key={tamaId} value={tamaId}>
              {findTamaName(tamaId) ?? `#${tamaId}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

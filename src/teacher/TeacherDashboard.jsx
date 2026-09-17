// Teacher dashboard — ported from the old teacher.html (gotchigarden repo),
// core roster + points loop only for this first pass. Left out on purpose,
// to be ported later: Google auth (no login gate here yet), prices panel,
// seating plan designer, photo/card export. CSV roster import was
// originally on this list too — see parseClassCsv below for that one.
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

// Splits one CSV line into fields, honoring double-quoted fields (so a
// quoted name like "Lee, Grace" doesn't get cut in half) and "" as an
// escaped quote inside one. The old teacher.html's parser just did
// line.split(','), which breaks on real school-exported sheets more often
// than you'd like — this is the one deliberate improvement over a literal
// port.
function splitCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

// Parses a class roster CSV — same column semantics as the old
// teacher.html's parseCSV (see that repo): headers matched case-
// insensitively, a row skipped only when an Active column exists and
// isn't "yes" (no Active column at all -> everyone's imported), the class
// name synthesized from Grade + English Class. One CSV = one class, same
// as before. UUID, if present, becomes the student's id (so re-importing
// the same roster elsewhere would line up) — otherwise one's generated.
// Adapted to our local student shape (see createCsvStudent below) instead
// of Supabase insert rows. Returns { error } on anything unusable, or
// { className, students } — never both.
function parseClassCsv(text) {
  const lines = text
    .replace(/^﻿/, '') // strip BOM
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return { error: 'That CSV has no data rows.' };

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const colIndex = (name) => headers.indexOf(name);
  const idx = {
    uuid: colIndex('uuid'),
    name: colIndex('name'),
    grade: colIndex('grade'),
    engClass: colIndex('english class'),
    active: colIndex('active'),
  };
  if (idx.name < 0) return { error: 'That CSV needs a "Name" column.' };

  let grade = '';
  let engClass = '';
  const students = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    if (idx.active >= 0 && (cols[idx.active] ?? '').toLowerCase() !== 'yes') continue;
    const name = (cols[idx.name] ?? '').trim();
    if (!name) continue;
    grade = cols[idx.grade] || grade;
    engClass = cols[idx.engClass] || engClass;
    const rawId = idx.uuid >= 0 ? cols[idx.uuid] : '';
    students.push({ id: rawId || undefined, name });
  }
  if (students.length === 0) return { error: 'No active students found in that CSV.' };

  const nameParts = [];
  if (grade) nameParts.push(`Grade ${grade}`);
  if (engClass) nameParts.push(engClass);
  return { className: nameParts.join(' — '), students };
}

// Builds a fresh student record for a CSV-imported row — always starts at
// 0 points/a fresh egg, same as the old importer's `gotchi_pts: 0`.
// s.id (the CSV's UUID column, if present) is preserved; otherwise a new
// one is generated, same as any other student.
function createCsvStudent(s) {
  return {
    id: s.id || uid(),
    name: s.name,
    email: '',
    gotchiPts: 0,
    lifetimePts: 0,
    pets: [],
    growth: newStudentProgress(),
    displayTamaId: 'current',
  };
}

export default function TeacherDashboard() {
  const initialStore = useState(loadStore)[0];
  const [classes, setClasses] = useState(initialStore.classes);
  const [currentClassId, setCurrentClassId] = useState(initialStore.currentClassId);
  const [search, setSearch] = useState('');
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [csvPreview, setCsvPreview] = useState(null); // { className, students } once a CSV's been parsed, until confirmed/cancelled
  const [csvImportName, setCsvImportName] = useState(''); // editable in the preview — the parsed className is just a starting suggestion
  const csvInputRef = useRef(null);
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

  function deleteClass(cls) {
    if (!confirm(`Delete "${cls.name}" and all ${cls.students.length} of its students? This cannot be undone.`)) return;
    setClasses((prev) => prev.filter((c) => c.id !== cls.id));
    if (currentClassId === cls.id) {
      const remaining = classes.filter((c) => c.id !== cls.id);
      setCurrentClassId(remaining[0]?.id ?? null);
      setSearch('');
    }
    toast(`Deleted ${cls.name}`);
  }

  // Opens the OS file picker (the actual <input type="file"> stays hidden
  // — see the sidebar's "Import CSV" button, which just clicks this ref).
  function openImportCsv() {
    csvInputRef.current?.click();
  }

  // Reads + parses the picked file and opens the preview modal on success.
  // Doesn't create anything yet — that's confirmImportCsv, so a teacher
  // can fix up the class name or back out first.
  function handleCsvFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // clears the input so picking the same file again still fires onChange
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseClassCsv(String(ev.target.result ?? ''));
      if (result.error) {
        toast(`⚠ ${result.error}`);
        return;
      }
      setCsvPreview(result);
      // Suggest the filename (minus .csv) when the sheet didn't have
      // Grade/English Class columns to synthesize a name from.
      setCsvImportName(result.className || file.name.replace(/\.csv$/i, ''));
    };
    reader.onerror = () => toast('⚠ Could not read that file');
    reader.readAsText(file);
  }

  function cancelImportCsv() {
    setCsvPreview(null);
  }

  function confirmImportCsv() {
    if (!csvPreview) return;
    const name = csvImportName.trim() || 'Imported Class';
    const cls = { id: uid(), name, students: csvPreview.students.map(createCsvStudent) };
    setClasses((prev) => [...prev, cls]);
    setCurrentClassId(cls.id);
    setCsvPreview(null);
    setSearch('');
    toast(`Imported ${name} with ${cls.students.length} students`);
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
              <div className="teacher-class-row" key={cls.id}>
                <button
                  className={`teacher-class-btn${cls.id === currentClassId ? ' active' : ''}`}
                  onClick={() => selectClass(cls.id)}
                >
                  {cls.name}
                </button>
                <button className="teacher-class-delete-btn" title={`Delete ${cls.name}`} onClick={() => deleteClass(cls)}>
                  ✕
                </button>
              </div>
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
              <>
                <button className="teacher-btn-new-class" onClick={() => setShowNewClassForm(true)}>
                  + New Class
                </button>
                <button className="teacher-btn-new-class import" onClick={openImportCsv}>
                  ↑ Import CSV
                </button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={handleCsvFileChange}
                />
              </>
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

      {csvPreview && (
        <div className="teacher-modal-backdrop open" onClick={(e) => e.target === e.currentTarget && cancelImportCsv()}>
          <div className="teacher-modal">
            <div className="teacher-modal-title">Import CSV</div>
            <div className="teacher-field">
              <label>Class Name</label>
              <input type="text" value={csvImportName} autoFocus onChange={(e) => setCsvImportName(e.target.value)} />
            </div>
            <div className="teacher-csv-summary">
              <strong>{csvPreview.students.length}</strong> active student{csvPreview.students.length === 1 ? '' : 's'} found:
            </div>
            <div className="teacher-csv-list">
              {csvPreview.students.map((s, i) => (
                <div className="teacher-csv-row" key={s.id ?? i}>
                  {s.name}
                </div>
              ))}
            </div>
            <div className="teacher-modal-btns">
              <button className="teacher-btn" onClick={cancelImportCsv}>
                Cancel
              </button>
              <button className="teacher-btn green" onClick={confirmImportCsv}>
                Import
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

// The shared data layer for both TeacherDashboard.jsx and IslandView.jsx —
// replaces what used to be independent localStorage read/write + a
// `storage`-event listener in each file. Single source of truth is
// Supabase itself: an initial fetch seeds state, then Realtime
// postgres_changes subscriptions on all three tables (see
// supabase/schema.sql) keep it live. Mutations just write to Supabase and
// let the realtime event reflect the result back into local state — same
// path whether the change came from THIS client or another signed-in
// device (Realtime broadcasts off the database's write-ahead log, not
// per-request, so the originating client gets its own event too, just
// like everyone else watching). No separate optimistic-update/
// reconciliation logic as a result — the tradeoff is a small
// (typically well under a second) lag between an action and it showing
// up, which is fine for a classroom tool.
//
// RLS (supabase/schema.sql) scopes every table to `owner_id = auth.uid()`
// (students via their class's owner_id), so every query/subscription here
// only ever sees this signed-in user's own data — no explicit
// owner-filtering needed on the client side.
//
// growth stays exactly the shape src/game/growth.js already produces/
// consumes (a plain object: currentTama, tamadex, closedTeens,
// closedBiomes, unlockedSecrets, growthConsumedPts) — it's just a jsonb
// column now instead of part of a localStorage blob. growth.js itself
// doesn't change at all.

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { newStudentProgress, applyPointsToGrowth } from '../game/growth.js';

function rowToStudent(row) {
  return {
    id: row.id,
    classId: row.class_id,
    name: row.name,
    email: row.email ?? '',
    gotchiPts: row.gotchi_pts,
    lifetimePts: row.lifetime_pts,
    growth: row.growth,
    // Stored as text (a column can't be "number or the literal string
    // 'current'") — same union growth.js's resolveDisplayTama already
    // handles once converted back.
    displayTamaId: row.display_tama_id === 'current' ? 'current' : Number(row.display_tama_id),
  };
}

// Moved here from TeacherDashboard.jsx — see this file's header for why
// growth.js itself doesn't own this. Unchanged logic: gotchiPts is the
// spendable currency balance, lifetimePts is the total ever earned and is
// what actually drives growth.js's meter/stage advancement (see
// applyPointsToGrowth), so deducting/spending gotchiPts can never shrink
// or un-advance a pet's growth — only the EARNED portion of an increase
// (Math.max(0, newGotchiPts - priorGotchiPts)) counts toward lifetimePts.
// Also still owns the "freeze display tama once an adult is reached" bug
// fix: keeps auto-following whatever's growing while displayTamaId is
// 'current', but pins it the moment a NEW adult is reached so the field
// doesn't quietly keep cycling forward.
function applyPtsChange(student, newGotchiPts) {
  const gotchiPts = Math.max(0, Number(newGotchiPts) || 0);
  const priorGotchiPts = student.gotchiPts ?? 0;
  const priorLifetimePts = student.lifetimePts ?? priorGotchiPts;
  const earnedDelta = Math.max(0, gotchiPts - priorGotchiPts);
  const lifetimePts = priorLifetimePts + earnedDelta;

  const { progress: growth, reachedAdultTamaIds } = applyPointsToGrowth(student.growth ?? newStudentProgress(), lifetimePts);
  const stillAutoFollowing = !student.displayTamaId || student.displayTamaId === 'current';
  const displayTamaId = stillAutoFollowing && reachedAdultTamaIds.length > 0 ? reachedAdultTamaIds.at(-1) : student.displayTamaId;
  return { gotchiPts, lifetimePts, growth, displayTamaId };
}

// session: the object from useAuth() (or null/undefined — the hook just
// returns empty state and does nothing until it's a real session).
export function useClassroomStore(session) {
  const userId = session?.user?.id;
  const [classes, setClasses] = useState([]); // [{id, name}]
  const [students, setStudents] = useState([]); // flat, ALL of this user's students across every class — filter to one class's roster the same way `activeClass?.students` used to
  const [currentClassId, setCurrentClassId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // No state to reset here on sign-out: both callers (TeacherDashboard,
    // IslandView) check auth.session and render LoginScreen before ever
    // reading anything this hook returns, so stale classes/students/
    // loading sitting unused while signed out is harmless — and a
    // subsequent sign-in re-runs this effect (userId changes) and
    // overwrites all of it with a fresh fetch anyway.
    if (!userId) return;

    let cancelled = false;
    // Resets loading back to true whenever userId changes (e.g. a fresh
    // sign-in after a sign-out) so the "Loading…" screen shows again
    // instead of briefly flashing stale content from a previous session
    // while the fetch below is in flight — a legitimate reset-state-on-
    // changed-dependency effect, not the "derive during render instead"
    // case this rule is usually right about.
    // eslint-disable-next-line react/set-state-in-effect
    setLoading(true);

    async function loadInitial() {
      const [classesRes, studentsRes, settingsRes] = await Promise.all([
        supabase.from('classes').select('id, name').order('created_at'),
        supabase.from('students').select('*').order('name'),
        supabase.from('user_settings').select('current_class_id').maybeSingle(),
      ]);
      if (cancelled) return;
      const firstError = classesRes.error || studentsRes.error || settingsRes.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }
      setClasses(classesRes.data ?? []);
      setStudents((studentsRes.data ?? []).map(rowToStudent));
      setCurrentClassId(settingsRes.data?.current_class_id ?? null);
      setLoading(false);
    }
    loadInitial();

    // Keeps everything live — see file header. RLS applies to these
    // subscriptions the same as any other query, so this only ever
    // receives this user's own rows.
    const channel = supabase
      .channel(`classroom-store-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, (payload) => {
        setClasses((prev) => applyRowChange(prev, payload, (r) => ({ id: r.id, name: r.name })));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, (payload) => {
        setStudents((prev) => applyRowChange(prev, payload, rowToStudent));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings' }, (payload) => {
        if (payload.eventType === 'DELETE') return; // a user's own settings row is never deleted in normal use
        setCurrentClassId(payload.new.current_class_id ?? null);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function createClass(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error: err } = await supabase.from('classes').insert({ owner_id: userId, name: trimmed });
    if (err) setError(err.message);
  }

  async function deleteClass(cls) {
    const { error: err } = await supabase.from('classes').delete().eq('id', cls.id);
    if (err) setError(err.message);
  }

  async function selectClass(classId) {
    const { error: err } = await supabase.from('user_settings').upsert({ owner_id: userId, current_class_id: classId }, { onConflict: 'owner_id' });
    if (err) setError(err.message);
  }

  async function createStudent(classId, { name, email, startingPts }) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const startingGotchiPts = Math.max(0, Number(startingPts) || 0);
    // A brand-new student's starting balance counts as already-earned —
    // gotchiPts and lifetimePts both start equal, same as applyPtsChange
    // would treat an increase from 0.
    const { progress: growth, reachedAdultTamaIds } = applyPointsToGrowth(newStudentProgress(), startingGotchiPts);
    const { error: err } = await supabase.from('students').insert({
      class_id: classId,
      name: trimmed,
      email: email.trim(),
      gotchi_pts: startingGotchiPts,
      lifetime_pts: startingGotchiPts,
      growth,
      display_tama_id: String(reachedAdultTamaIds.at(-1) ?? 'current'),
    });
    if (err) setError(err.message);
  }

  // One CSV import = one class + its full roster, created together — see
  // TeacherDashboard.jsx's parseClassCsv for where csvStudents comes from.
  // Every imported student starts at 0 pts/a fresh egg, same as before.
  async function createCsvClass(name, csvStudents) {
    const { data: cls, error: clsErr } = await supabase.from('classes').insert({ owner_id: userId, name }).select().single();
    if (clsErr) {
      setError(clsErr.message);
      return null;
    }
    const rows = csvStudents.map((s) => ({
      ...(s.id ? { id: s.id } : {}), // preserves a CSV's own UUID column when present, same as the old localStorage-based importer
      class_id: cls.id,
      name: s.name,
      email: '',
      gotchi_pts: 0,
      lifetime_pts: 0,
      growth: newStudentProgress(),
      display_tama_id: 'current',
    }));
    const { error: stuErr } = await supabase.from('students').insert(rows);
    if (stuErr) {
      setError(stuErr.message);
      return null;
    }
    return { classId: cls.id, count: rows.length };
  }

  async function removeStudent(studentId) {
    const { error: err } = await supabase.from('students').delete().eq('id', studentId);
    if (err) setError(err.message);
  }

  // student: the CURRENT student object (from `students` above) — needed
  // to compute the gotchiPts/lifetimePts delta, see applyPtsChange.
  async function setStudentPts(student, newGotchiPts) {
    const next = applyPtsChange(student, newGotchiPts);
    const { error: err } = await supabase
      .from('students')
      .update({
        gotchi_pts: next.gotchiPts,
        lifetime_pts: next.lifetimePts,
        growth: next.growth,
        display_tama_id: String(next.displayTamaId),
      })
      .eq('id', student.id);
    if (err) setError(err.message);
  }

  // classStudents: the current roster (so each gets its OWN delta off its
  // own current balance) — fired as parallel per-student updates rather
  // than a single batch call (Supabase's JS client can't apply a
  // different value per row in one request); classes here max out around
  // 16 students, so this stays cheap.
  async function awardAllPts(classStudents, sign, amount) {
    const amt = Math.max(1, Number(amount) || 1) * sign;
    await Promise.all(classStudents.map((s) => setStudentPts(s, s.gotchiPts + amt)));
  }

  async function setDisplayTama(studentId, displayTamaId) {
    const { error: err } = await supabase.from('students').update({ display_tama_id: String(displayTamaId) }).eq('id', studentId);
    if (err) setError(err.message);
  }

  return {
    loading,
    error,
    classes,
    students,
    currentClassId,
    createClass,
    deleteClass,
    selectClass,
    createStudent,
    createCsvClass,
    removeStudent,
    setStudentPts,
    awardAllPts,
    setDisplayTama,
  };
}

// Applies one realtime postgres_changes payload to a local array keyed by
// id — shared by the classes/students subscriptions above (rowMapper
// converts a raw DB row into whatever shape that array stores).
function applyRowChange(list, payload, rowMapper) {
  if (payload.eventType === 'DELETE') {
    return list.filter((item) => item.id !== payload.old.id);
  }
  const mapped = rowMapper(payload.new);
  const exists = list.some((item) => item.id === mapped.id);
  return exists ? list.map((item) => (item.id === mapped.id ? mapped : item)) : [...list, mapped];
}

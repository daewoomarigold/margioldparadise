// The shared "island" — every student's display tama roaming together on
// one background, meant to be projected in class (see GAME_DESIGN.md "The
// shared island"). First mockup: reads the same localStorage the teacher
// dashboard writes to (no backend yet — see TeacherDashboard.jsx's header
// comment), shows the currently-active class's students, and roams each
// one using physics ported from the old gotchigarden.html (see
// src/game/movement.js).
//
// Not wired into navigation yet — open with /?view=island.

import { useEffect, useMemo, useRef, useState } from 'react';
import { spriteUrl, resolveAnimState } from '../game/spriteData.js';
import { TamaComposite } from '../game/spriteCompositor.jsx';
import { createRoamer, stepRoamer, stepAnim } from '../game/movement.js';
import { getYBoundsForImage683 } from './terrain.js';
import { resolveDisplayTama } from '../game/growth.js';
import StudentGrid from './StudentGrid.jsx';
import TamadexToast from './TamadexToast.jsx';

const STORAGE_KEY = 'marigold-teacher-data-v1'; // must match TeacherDashboard.jsx

const BACKGROUND_FILE = 'image-683.png';
const CANVAS_W = 512;
const CANVAS_H = 512;
const SCALE = 1; // mini sprites are 32x32 native; this is their on-screen size multiplier
const SPRITE_PX = 32 * SCALE;
const HATCH_FRAME_MS = 350; // per-frame duration for the one-shot egg_hatch playback

// The island now writes back (setting a student's display tama from the
// tamadex toast), not just reads — so it holds the full store (all
// classes + which one is active), not just a snapshot of the active
// class, so a write can update one student without clobbering every
// other class's data.
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
    return { classes: [], currentClassId: null }; // corrupted/blocked storage — render the empty state rather than crash
  }
}

export default function IslandView() {
  const [store, setStore] = useState(loadStore);
  const roamersRef = useRef(new Map()); // studentId -> mutable roamer state (see movement.js)
  const lastTsRef = useRef(null);
  const [, setTick] = useState(0); // bumped every animation frame to force a re-render from the refs above
  const [selectedStudentId, setSelectedStudentId] = useState(null); // which student's tamadex toast is open, if any
  const prevStagesRef = useRef(new Map()); // studentId -> last-seen display stage, to detect an egg->baby transition
  const hatchStateRef = useRef(new Map()); // studentId -> { startedAt, frame } while egg_hatch is playing one-shot
  const studentsRef = useRef([]); // kept fresh via the effect below so the rAF loop always sees the latest roster without restarting itself

  const activeClass = useMemo(
    () => store.classes.find((c) => c.id === store.currentClassId) ?? store.classes[0] ?? null,
    [store],
  );
  // Stabilized so the roster-sync effect below doesn't see a "new" array
  // (and re-run its add/remove diff pointlessly) on every animation-frame
  // re-render when there's no active class.
  const students = useMemo(() => activeClass?.students ?? [], [activeClass]);
  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  // Re-read the store when the teacher dashboard (a separate tab/window,
  // typically) changes it, so the island stays live without a backend.
  // Doesn't fire for the island's own writes (setDisplayTama below) — the
  // browser only dispatches `storage` to OTHER tabs/windows — so those
  // update local state directly instead of waiting for this.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY) setStore(loadStore());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // The island can now set a student's display tama (from the tamadex
  // toast) — persisted back to the same shared store the teacher
  // dashboard writes to, so it survives reloads and shows up there too.
  function setDisplayTama(studentId, tamaId) {
    setStore((prev) => {
      const next = {
        ...prev,
        classes: prev.classes.map((c) =>
          c.id !== activeClass?.id
            ? c
            : { ...c, students: c.students.map((s) => (s.id === studentId ? { ...s, displayTamaId: tamaId } : s)) },
        ),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage full/blocked — the change still applies for this session via React state below
      }
      return next;
    });
  }

  // Keep roamer entries in sync with the current roster — add newly-added
  // students, drop removed ones — without resetting anyone already roaming
  // (their position/velocity/animation phase should survive a roster edit
  // elsewhere, not jump/reset).
  useEffect(() => {
    const roamers = roamersRef.current;
    const currentIds = new Set(students.map((s) => s.id));
    for (const id of [...roamers.keys()]) {
      if (!currentIds.has(id)) roamers.delete(id);
    }
    for (const s of students) {
      if (!roamers.has(s.id)) {
        roamers.set(
          s.id,
          createRoamer({ id: s.id, canvasWidth: CANVAS_W, spriteWidth: SPRITE_PX, spriteHeight: SPRITE_PX, getYBounds: getYBoundsForImage683 }),
        );
      }
    }
  }, [students]);

  // Static lookups (same object every call, pure function over the JSON
  // import) — fine to capture once in the rAF effect's closure below even
  // though that effect only runs on mount ([] deps).
  const walk = resolveAnimState('walk_left');
  const eggRock = resolveAnimState('egg_rock');
  const eggHatch = resolveAnimState('egg_hatch');

  useEffect(() => {
    let raf;
    function frame(ts) {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      // Clamp dt so a backgrounded/throttled tab doesn't produce one huge
      // jump in position when it regains focus.
      const dt = Math.min(0.1, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;
      for (const roamer of roamersRef.current.values()) {
        stepRoamer(roamer, dt, CANVAS_W);
        stepAnim(roamer, dt);
      }

      // Detect egg -> non-egg transitions and manage the one-shot
      // egg_hatch playback. Done here (not during render) since it writes
      // to refs — imperative per-frame state, same as the roamer stepping
      // above, not something render should be doing.
      for (const s of studentsRef.current) {
        const currentStage = resolveDisplayTama(s).stage;
        const prevStage = prevStagesRef.current.get(s.id);
        if (prevStage === 'egg' && currentStage !== 'egg' && !hatchStateRef.current.has(s.id)) {
          hatchStateRef.current.set(s.id, { startedAt: ts, frame: 0 });
        }
        prevStagesRef.current.set(s.id, currentStage);

        const hatch = hatchStateRef.current.get(s.id);
        if (hatch) {
          const frameIdx = Math.floor((ts - hatch.startedAt) / HATCH_FRAME_MS);
          if (frameIdx >= eggHatch.body.length) {
            hatchStateRef.current.delete(s.id); // playback finished — display switches to the new stage next render
          } else {
            hatch.frame = frameIdx;
          }
        }
      }

      setTick((t) => t + 1);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eggHatch is static data (resolveAnimState over the JSON import) —
    // same value every render, safe to omit; runs once by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Looked up fresh from `students` (not stored as its own object) so the
  // toast reflects live growth/points changes from another tab while open.
  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null;

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: '#0e0e1a',
        fontFamily: 'ui-monospace, monospace',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
      <div
        style={{
          position: 'relative',
          width: CANVAS_W,
          height: CANVAS_H,
          maxWidth: '100%',
          aspectRatio: '1 / 1',
          overflow: 'hidden',
          borderRadius: 8,
          boxShadow: '0 0 0 1px #2e2e4e',
        }}
      >
        <img
          src={spriteUrl(BACKGROUND_FILE)}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />

        {!activeClass && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              textShadow: '0 1px 3px #000',
              fontSize: 13,
              textAlign: 'center',
              padding: 24,
            }}
          >
            No class selected yet — pick one in the teacher dashboard.
          </div>
        )}

        {students.map((s) => {
          const growth = s.growth;
          // Deliberately reading the ref during render: roamersRef is the
          // physics loop's mutable source of truth (updated imperatively
          // in the rAF effect above, 60x/sec), and this render only runs
          // because that loop just bumped `tick` — not the "derived state
          // stuffed in a ref" anti-pattern the lint rule usually flags.
          const roamer = roamersRef.current.get(s.id);
          if (!growth || !roamer) return null;
          // The field shows the CHOSEN display tama, not necessarily what's
          // growing — see growth.js's resolveDisplayTama and StudentGrid's
          // header comment for the asymmetric-design rationale.
          const { stage, tamaId } = resolveDisplayTama(s);

          // Same fixed spot for both — eggs (and the hatch moment right
          // after one) don't roam, matching the old gotchigarden.html's
          // "eggs don't move" behavior.
          const eggSpotStyle = { position: 'absolute', left: CANVAS_W / 2 - SPRITE_PX / 2, top: CANVAS_H * 0.78 };

          const hatch = hatchStateRef.current.get(s.id);
          if (hatch) {
            // One-shot egg_hatch playback in progress — keep showing this
            // even though `stage` may have already flipped to baby, so the
            // transition reads as "hatching" rather than an instant swap.
            return (
              <div key={s.id} style={eggSpotStyle}>
                <TamaComposite tamaId="egg" variant="mini" frames={{ body: eggHatch.body[hatch.frame], eyes: 0, mouth: 0 }} scale={SCALE} />
                <NameTag name={s.name} />
              </div>
            );
          }

          if (stage === 'egg') {
            return (
              <div key={s.id} style={eggSpotStyle}>
                <TamaComposite
                  tamaId="egg"
                  variant="mini"
                  frames={{ body: eggRock.body[roamer.animFrame % eggRock.body.length], eyes: 0, mouth: 0 }}
                  scale={SCALE}
                />
                <NameTag name={s.name} />
              </div>
            );
          }

          const bodyFrame = walk.body[roamer.animFrame % walk.body.length];
          const eyesFrame = walk.eyes[roamer.animFrame % walk.eyes.length];
          const mouthFrame = walk.mouth[roamer.animFrame % walk.mouth.length];
          const faceOffset = {
            x: walk.faceOffsetX[roamer.animFrame % walk.faceOffsetX.length],
            y: walk.faceOffsetY[roamer.animFrame % walk.faceOffsetY.length],
          };

          return (
            <div key={s.id} style={{ position: 'absolute', left: roamer.x, top: roamer.y }}>
              <TamaComposite
                tamaId={tamaId}
                variant="mini"
                frames={{ body: bodyFrame, eyes: eyesFrame, mouth: mouthFrame }}
                scale={SCALE}
                mirrored={roamer.facingRight}
                faceOffset={faceOffset}
              />
              <NameTag name={s.name} />
            </div>
          );
        })}
      </div>

      <StudentGrid students={students} onSelectStudent={(s) => setSelectedStudentId(s.id)} />
      </div>

      <div style={{ color: '#7070a0', fontSize: 11 }}>{activeClass ? activeClass.name : 'Marigold Island'}</div>

      {selectedStudent && (
        <TamadexToast
          student={selectedStudent}
          onSelectDisplay={(tamaId) => setDisplayTama(selectedStudent.id, tamaId)}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  );
}

function NameTag({ name }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: -14,
        left: 0,
        width: '100%',
        textAlign: 'center',
        fontSize: 9,
        color: '#fff',
        textShadow: '0 1px 2px #000',
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </div>
  );
}

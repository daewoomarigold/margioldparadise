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
import StudentGrid from './StudentGrid.jsx';
import TamadexToast from './TamadexToast.jsx';

const STORAGE_KEY = 'marigold-teacher-data-v1'; // must match TeacherDashboard.jsx

const BACKGROUND_FILE = 'image-683.png';
const CANVAS_W = 512;
const CANVAS_H = 512;
const SCALE = 1; // mini sprites are 32x32 native; this is their on-screen size multiplier
const SPRITE_PX = 32 * SCALE;

function loadActiveClass() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const classes = Array.isArray(parsed.classes) ? parsed.classes : [];
    if (!classes.length) return null;
    return classes.find((c) => c.id === parsed.currentClassId) ?? classes[0];
  } catch {
    return null; // corrupted/blocked storage — render the empty state rather than crash
  }
}

export default function IslandView() {
  const [activeClass, setActiveClass] = useState(loadActiveClass);
  const roamersRef = useRef(new Map()); // studentId -> mutable roamer state (see movement.js)
  const lastTsRef = useRef(null);
  const [, setTick] = useState(0); // bumped every animation frame to force a re-render from the refs above
  const [selectedStudentId, setSelectedStudentId] = useState(null); // which student's tamadex toast is open, if any

  // Stabilized so the roster-sync effect below doesn't see a "new" array
  // (and re-run its add/remove diff pointlessly) on every animation-frame
  // re-render when there's no active class.
  const students = useMemo(() => activeClass?.students ?? [], [activeClass]);

  // Re-read the store when the teacher dashboard (a separate tab/window,
  // typically) changes it, so the island stays live without a backend.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY) setActiveClass(loadActiveClass());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
      setTick((t) => t + 1);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const walk = resolveAnimState('walk_left'); // shared by all tamas — see animationStates.json
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
          const { stage, tamaId } = growth.currentTama;

          if (stage === 'egg') {
            // Eggs don't roam — fixed near the bottom, matching the old
            // gotchigarden.html's "eggs don't move" behavior.
            return (
              <div
                key={s.id}
                style={{ position: 'absolute', left: CANVAS_W / 2 - SPRITE_PX / 2, top: CANVAS_H * 0.78 }}
              >
                <TamaComposite tamaId="egg" variant="mini" frames={{ body: 0, eyes: 0, mouth: 0 }} scale={SCALE} />
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

      {selectedStudent && <TamadexToast student={selectedStudent} onClose={() => setSelectedStudentId(null)} />}
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

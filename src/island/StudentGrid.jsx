// 4x4 roster grid shown alongside the island — one tile per student
// (Taylor's real classes max out at 16), showing their GROWING tama (not
// their chosen display tama — see the asymmetric-design note below),
// growth meter, name, and current gotchiPts balance (the spendable
// currency — see TeacherDashboard.jsx's file header for the
// gotchiPts/lifetimePts split; the meter above it tracks lifetimePts
// instead, so spending never moves it). Tamadex progress isn't shown here
// — that lives inside the toast (TamadexToast.jsx) a tile opens on click,
// so it's not duplicated in two places. Empty slots render as plain
// placeholders, matching the mockup. Tamas play the "walking_forward"
// animation state (a face-the-camera walk-in-place, body frames [4,5],
// static eyes/mouth) in place — no roaming/movement, this is a dashboard
// panel, not part of the island canvas itself.
//
// Asymmetric by design: the island field shows whatever tama a student
// has chosen to display (resolveDisplayTama in growth.js — 'current'
// growing tama by default, or a specific completed adult they picked in
// the tamadex toast), but this tile always shows growth.currentTama
// directly regardless of that choice — it's a progress/status readout
// (paired with the meter right below it), not the showcase. A student
// mid-toddler can proudly display a finished adult on the island while
// this tile still tracks the toddler actually growing.
//
// Tapping a tile opens the tamadex toast (see TamadexToast.jsx), where a
// student can change their display tama; a future item shop could pop
// out from here too.
//
// Evolution overlay: whenever a tile's growth.currentTama identity changes
// (egg->baby, baby->toddler, ..., adult->a fresh egg next cycle), it plays
// a short transformation sequence — cycle idle/happy (or, for an egg, the
// real egg_hatch crack/burst frames), shake, white flash-hold-reveal —
// before settling back into the normal walking_forward loop. Ported from
// the old gotchigarden.html's triggerEvolve() (see that repo's EVOLVE
// SEQUENCE section): same cycle -> shake -> flash -> reveal shape, same
// sine-wave shake, just the ANIMATION choreography — none of the old
// cost/feeding/wait-days gating carried over, since growth here already
// advances the moment points land (see growth.js). Unlike the old code
// (which only animated baby->adult; egg hatching was a wholly separate
// flow there), this plays for every stage change here including
// egg->baby, using egg_hatch's actual crack/burst frames in place of the
// idle/happy cycle (an egg has no face to cycle/shake).
//
// The flash itself is a silhouette of the sprite being shown, not a plain
// white box — a second copy of the same TamaComposite, CSS-filtered to
// brightness(0) invert(1) (turns every opaque pixel white, same alpha
// shape the sprite already has — see TamadexToast's brightness(0) for the
// black-silhouette half of this trick), faded in/out via opacity. That
// keeps the flash shaped to whatever's actually on screen — including
// transparent pixels around it — instead of flashing a hard-edged square.
//
// Tile-only, by request — the island field's roamers are untouched.

import { useEffect, useRef, useState } from 'react';
import { meterFraction, POINTS_PER_GROWTH } from '../game/growth.js';
import { resolveAnimState, spriteUrl } from '../game/spriteData.js';
import { TamaComposite } from '../game/spriteCompositor.jsx';

const GRID_SIZE = 16; // 4x4 — matches the real max class size, not just the current roster
const TILE_SCALE = 2; // mini sprites are 32x32 native; on-screen size within the tile
const TILE_ANIM_FPS = 2; // was 4 — read as too fast for a small in-place idle bob

const WALKING_FORWARD = resolveAnimState('walking_forward');
const EGG_ROCK = resolveAnimState('egg_rock');
const EGG_HATCH = resolveAnimState('egg_hatch');
const IDLE = resolveAnimState('idle');
const HAPPY = resolveAnimState('happy');

// Evolution sequence timings (ms), adapted from triggerEvolve()'s
// stand/cycle/shake/flash/wave beats — shortened a bit since this is a
// small dashboard tile, not a full-screen moment. The flash beats
// (in/hold/out) were slowed down from the first pass for more suspense
// before the reveal.
const EVO_CYCLE_STEP_MS = 250; // matches the original's cycle cadence exactly
const EVO_CYCLE_STEPS = 8; // 8 * 250ms = 2s, same total as the original's stand+cycle buildup
const EVO_HATCH_FRAME_MS = 350; // matches IslandView's own one-shot egg_hatch playback
const EVO_SHAKE_MS = 1200; // was 1500 in the original
const EVO_FLASH_IN_MS = 650; // was 350 — slower ramp to white
const EVO_FLASH_HOLD_MS = 450; // new — a beat held at full white before the reveal starts
const EVO_FLASH_OUT_MS = 900; // was 500 — slower, more dramatic reveal
const EVO_CELEBRATE_MS = 1400; // was 2500 (a brief happy pose here, not a full wave animation — we don't have a "wave" state defined)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Grass-and-tree background for occupied tiles (empty slots stay plain —
// see EmptyTile). A dark scrim is layered under it so the name/meter/dex
// text (styled for the old flat dark background) stays legible over the
// lighter art; imageRendering:pixelated keeps it crisp since the tile is
// smaller on-screen than the sprite's native 128x128.
const TILE_BG_URL = spriteUrl('image-1402.png');

// The in-universe "gotchi coin" icon (16x16), used instead of a generic ★
// so the currency reads as an actual game item rather than an abstract
// rating symbol.
const COIN_URL = spriteUrl('image-95.png');

export default function StudentGrid({ students, onSelectStudent }) {
  const tiles = Array.from({ length: GRID_SIZE }, (_, i) => students[i] ?? null);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridAutoRows: '1fr',
        gap: 8,
        width: 512,
        maxWidth: '100%',
      }}
    >
      {tiles.map((s, i) =>
        s ? <StudentTile key={s.id} student={s} onClick={() => onSelectStudent(s)} /> : <EmptyTile key={`empty-${i}`} />,
      )}
    </div>
  );
}

function StudentTile({ student, onClick }) {
  const growth = student.growth;
  const fraction = meterFraction(growth, student.lifetimePts ?? student.gotchiPts);
  const { stage, tamaId } = growth.currentTama; // deliberately the growing tama, not the display tama — see file header
  const isEgg = stage === 'egg';

  // Cycles walking_forward's 2 body frames in place — no position movement
  // (this is a static tile, not the roaming island), just a "still alive"
  // animation. Eggs get the same treatment via egg_rock instead (no face
  // to animate, so faceOffset stays unused for them).
  const [animFrame, setAnimFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAnimFrame((f) => f + 1), 1000 / TILE_ANIM_FPS);
    return () => clearInterval(id);
  }, []);

  // --- Evolution overlay -------------------------------------------------
  // See the file header for the full picture. prevTamaRef remembers what
  // was showing last render; when stage/tamaId changes we still have the
  // OLD identity in hand (needed for the cycle/shake beats, which show the
  // pet that's ABOUT to transform, not the new one) before kicking off the
  // sequence. `evo` is null during normal play.
  const prevTamaRef = useRef(null);
  const [evo, setEvo] = useState(null);

  useEffect(() => {
    const prev = prevTamaRef.current;
    const isInitialMount = prev == null;
    const changed = !isInitialMount && (prev.tamaId !== tamaId || prev.stage !== stage);
    prevTamaRef.current = { stage, tamaId };
    if (!changed) return;

    let cancelled = false;
    const isCancelled = () => cancelled;
    runEvolution(prev, isCancelled, setEvo).then(() => {
      if (!cancelled) setEvo(null);
    });
    return () => {
      cancelled = true;
    };
    // Only re-run when the growing tama's identity actually changes —
    // intentionally not depending on setEvo (stable) or the functions
    // above (module-level, pure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, tamaId]);

  const eggFrameIdx = animFrame % EGG_ROCK.body.length;
  const normalFrames = isEgg
    ? { body: EGG_ROCK.body[eggFrameIdx], eyes: 0, mouth: 0 }
    : {
        body: WALKING_FORWARD.body[animFrame % WALKING_FORWARD.body.length],
        eyes: WALKING_FORWARD.eyes[animFrame % WALKING_FORWARD.eyes.length],
        mouth: WALKING_FORWARD.mouth[animFrame % WALKING_FORWARD.mouth.length],
      };
  const normalFaceOffset = isEgg
    ? undefined
    : {
        x: WALKING_FORWARD.faceOffsetX[animFrame % WALKING_FORWARD.faceOffsetX.length],
        y: WALKING_FORWARD.faceOffsetY[animFrame % WALKING_FORWARD.faceOffsetY.length],
      };
  const normalMirrored = isEgg && EGG_ROCK.bodyMirror[eggFrameIdx % EGG_ROCK.bodyMirror.length];

  // While evolving, override what's shown — see evoSpriteFor below for the
  // per-phase logic (which pet, which pose, whether it's shaking).
  const showing = evo ? evoSpriteFor(evo, isEgg, tamaId) : { tamaId: isEgg ? 'egg' : tamaId, frames: normalFrames, mirrored: normalMirrored, faceOffset: normalFaceOffset, shakeX: 0 };

  // Full opacity through both flashIn and the flashHold beat (the "swap
  // happens while fully white" moment — see evoSpriteFor); only flashOut
  // actually animates back down to reveal what's underneath.
  const flashOpacity = evo?.phase === 'flashIn' || evo?.phase === 'flashHold' ? 1 : 0;
  const flashMs = evo?.phase === 'flashIn' ? EVO_FLASH_IN_MS : evo?.phase === 'flashOut' ? EVO_FLASH_OUT_MS : 0;

  return (
    <div style={{ ...tileStyle, ...tileBgStyle, cursor: 'pointer' }} onClick={onClick}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 32 * TILE_SCALE }}>
        <div style={{ position: 'relative', transform: `translateX(${showing.shakeX}px)` }}>
          <TamaComposite
            tamaId={showing.tamaId}
            variant="mini"
            frames={showing.frames}
            scale={TILE_SCALE}
            mirrored={showing.mirrored}
            faceOffset={showing.faceOffset}
          />
          <div style={{ ...flashMaskStyle, opacity: flashOpacity, transition: `opacity ${flashMs}ms linear` }}>
            <TamaComposite
              tamaId={showing.tamaId}
              variant="mini"
              frames={showing.frames}
              scale={TILE_SCALE}
              mirrored={showing.mirrored}
              faceOffset={showing.faceOffset}
            />
          </div>
        </div>
      </div>
      <div style={nameStyle}>{student.name}</div>
      <div style={meterTrackStyle} title={`${Math.round(fraction * POINTS_PER_GROWTH)}/${POINTS_PER_GROWTH} pts to next stage`}>
        <div style={{ ...meterFillStyle, width: `${fraction * 100}%` }} />
      </div>
      <div style={ptsStyle}>
        <img src={COIN_URL} alt="" style={coinIconStyle} />
        {student.gotchiPts}
      </div>
    </div>
  );
}

// Runs the ported triggerEvolve() choreography, pushing each beat into
// setEvo as it happens (the caller renders off that state). oldTama is
// {stage, tamaId} captured right before the change — that's what the
// cycle/shake/hatch beats show, since they're meant to be the pet
// transforming, not the result.
async function runEvolution(oldTama, isCancelled, setEvo) {
  if (oldTama.stage === 'egg') {
    // Play the real hatch crack/burst frames (egg_hatch — see
    // animationStates.json) instead of the idle/happy cycle an egg has no
    // face for. Same per-frame timing IslandView uses for its own
    // one-shot hatch playback.
    for (let i = 0; i < EGG_HATCH.body.length && !isCancelled(); i++) {
      setEvo({ phase: 'hatch', oldTama, hatchFrameIdx: i });
      await sleep(EVO_HATCH_FRAME_MS);
    }
    if (isCancelled()) return;
  } else {
    for (let i = 0; i < EVO_CYCLE_STEPS && !isCancelled(); i++) {
      setEvo({ phase: 'cycle', oldTama, cycleIdx: i });
      await sleep(EVO_CYCLE_STEP_MS);
    }
    if (isCancelled()) return;

    await new Promise((resolve) => {
      const start = performance.now();
      function frame(ts) {
        if (isCancelled()) return resolve();
        const elapsed = ts - start;
        if (elapsed >= EVO_SHAKE_MS) {
          resolve();
          return;
        }
        // Same sine shape as the original's shake, scaled down (*3 vs *4)
        // for this tile's smaller size.
        const shakeX = Math.sin((elapsed / 60) * Math.PI * 2) * 3;
        setEvo({ phase: 'shake', oldTama, shakeX });
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    if (isCancelled()) return;
  }

  setEvo({ phase: 'flashIn', oldTama });
  await sleep(EVO_FLASH_IN_MS);
  if (isCancelled()) return;

  // Hold at full white for a beat — the suspenseful pause right before the
  // reveal. The new pet is already what's rendered underneath from here on
  // (see evoSpriteFor), just fully hidden until flashOut fades the white
  // back down.
  setEvo({ phase: 'flashHold', oldTama });
  await sleep(EVO_FLASH_HOLD_MS);
  if (isCancelled()) return;

  setEvo({ phase: 'flashOut', oldTama });
  await sleep(EVO_FLASH_OUT_MS);
  if (isCancelled()) return;

  setEvo({ phase: 'celebrate', oldTama });
  await sleep(EVO_CELEBRATE_MS);
}

// Resolves an in-progress evolution's phase into what TamaComposite should
// render. cycle/shake/hatch/flashIn still show the OLD pet (idle/happy
// alternating for cycle, a static idle pose while shaking, the live
// egg_hatch frame while hatching); flashHold/flashOut/celebrate show the
// NEW one (current isEgg/tamaId — the actual props the tile was passed,
// already updated by the time the sequence gets here).
function evoSpriteFor(evo, isEgg, tamaId) {
  const { phase, oldTama, cycleIdx = 0, shakeX = 0, hatchFrameIdx = 0 } = evo;
  const showingOld = phase === 'cycle' || phase === 'shake' || phase === 'hatch' || phase === 'flashIn';

  if (phase === 'hatch') {
    return { tamaId: 'egg', frames: { body: EGG_HATCH.body[hatchFrameIdx], eyes: 0, mouth: 0 }, mirrored: false, faceOffset: undefined, shakeX: 0 };
  }
  if (showingOld && oldTama.stage === 'egg') {
    // flashIn right after an egg->baby hatch — hold on egg_hatch's final
    // (burst) frame instead of snapping back to a plain egg.
    return { tamaId: 'egg', frames: { body: EGG_HATCH.body.at(-1), eyes: 0, mouth: 0 }, mirrored: false, faceOffset: undefined, shakeX: 0 };
  }
  if (showingOld) {
    const pose = phase === 'cycle' ? (cycleIdx % 2 === 0 ? IDLE : HAPPY) : IDLE;
    return {
      tamaId: oldTama.tamaId,
      frames: { body: pose.body[0], eyes: pose.eyes[0], mouth: pose.mouth[0] },
      mirrored: false,
      faceOffset: { x: 0, y: 0 },
      shakeX: phase === 'shake' ? shakeX : 0,
    };
  }

  // flashHold / flashOut / celebrate — the new pet.
  if (isEgg) {
    return { tamaId: 'egg', frames: { body: 0, eyes: 0, mouth: 0 }, mirrored: false, faceOffset: undefined, shakeX: 0 };
  }
  const pose = phase === 'celebrate' ? HAPPY : IDLE;
  return {
    tamaId,
    frames: { body: pose.body[0], eyes: pose.eyes[0], mouth: pose.mouth[0] },
    mirrored: false,
    faceOffset: { x: 0, y: 0 },
    shakeX: 0,
  };
}

function EmptyTile() {
  return <div style={{ ...tileStyle, border: '1px dashed #2e2e4e', background: 'transparent' }} />;
}

const tileStyle = {
  aspectRatio: '1 / 1',
  backgroundColor: '#22223a', // fallback beneath the image/scrim (StudentTile) or plain background (EmptyTile)
  border: '1px solid #2e2e4e',
  borderRadius: 6,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: 6,
  boxSizing: 'border-box',
  overflow: 'hidden',
  fontFamily: 'ui-monospace, monospace',
};

// Layered on top of tileStyle for occupied tiles only — a dark scrim under
// the grass art so the light-on-dark text styles below stay readable.
const tileBgStyle = {
  backgroundImage: `linear-gradient(rgba(10, 10, 20, 0.5), rgba(10, 10, 20, 0.5)), url(${TILE_BG_URL})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  imageRendering: 'pixelated',
};

const nameStyle = {
  fontSize: 10,
  color: '#e0e0f0',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
};

const meterTrackStyle = {
  width: '85%',
  height: 5,
  background: '#1a1a2e',
  border: '1px solid #2e2e4e',
  borderRadius: 3,
  overflow: 'hidden',
};

const meterFillStyle = {
  height: '100%',
  background: '#4ef0d8',
  transition: 'width 0.2s',
};

const ptsStyle = {
  fontSize: 8,
  color: '#ffe066', // matches the teacher dashboard's ★-prefixed currency styling (Award button, tamadex star)
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
  display: 'flex',
  alignItems: 'center',
  gap: 3,
};

const coinIconStyle = {
  width: 10,
  height: 10,
  imageRendering: 'pixelated',
};

// The evolution sequence's white flash — a second copy of whatever
// TamaComposite is showing, filtered to a white silhouette (brightness(0)
// turns every opaque pixel black while leaving alpha untouched — same
// trick TamadexToast uses for its uncollected entries — then invert(1)
// flips that black to white) and cross-faded via opacity. Shaped exactly
// to the sprite's own transparency, not a hard-edged box. inset:0 against
// the sprite's own wrapper (position:relative) keeps it pixel-aligned
// regardless of tile scale or the shake offset it inherits from its
// parent.
const flashMaskStyle = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  filter: 'brightness(0) invert(1)',
};

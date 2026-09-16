// Dev-only tool: composites a tama's body/eyes/mouth sprite sheets together.
// The three sheets are independent — a "state" (idle, happy, walk, ...) is a
// hand-picked combination of one frame from each, e.g. idle = b0 + e0 + m0.
// This tool lets you step each layer separately, see the composite live, and
// capture named states into a table you can export.
//
// Not part of the production build — see the DEV-gated import in main.jsx.
// Open with: npm run dev, then visit /?dev=assembler

import { useEffect, useMemo, useState } from 'react';
import atlas from '../data/tamaAtlas.json';
import animationStates from '../data/animationStates.json';
import { VARIANT_INFO, makeDefaultGeom, resolveAnimState, spriteUrl } from '../game/spriteData.js';
import { Cropped } from '../game/spriteCompositor.jsx';

// Frame-width/geometry facts and the eyes/mouth bible-offset story are
// documented in src/game/spriteCompositor.jsx now — this file just wires
// them into the interactive tuning UI. See that file's header comment for
// the full derivation (catalog.json subimages counts, Scalynko/
// TamaParaGenerator's data.json, etc.).

// Full, unsliced sheet with vertical gridlines every frameWidth px, so you
// can visually confirm the frame width lines up with the art.
function SheetWithGrid({ file, frameWidth, frameIndex, label, sheetWidth, sheetHeight }) {
  const displayScale = 2;
  const lineCount = Math.floor(sheetWidth / frameWidth);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>
        {label} — {file} ({sheetWidth}×{sheetHeight}, {lineCount} frames @ {frameWidth}px)
      </div>
      <div style={{ position: 'relative', display: 'inline-block', background: '#4443', lineHeight: 0 }}>
        <img
          src={spriteUrl(file)}
          style={{
            imageRendering: 'pixelated',
            width: sheetWidth * displayScale,
            height: sheetHeight * displayScale,
            display: 'block',
          }}
        />
        {Array.from({ length: lineCount + 1 }, (_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: i * frameWidth * displayScale,
              top: 0,
              width: 1,
              height: sheetHeight * displayScale,
              background: i === frameIndex || i === frameIndex + 1 ? 'rgba(255,220,0,0.9)' : 'rgba(255,0,0,0.4)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// First-pass guesses for tama #0 (base variant), seeded so there's something
// to correct rather than a blank table — not confirmed. Frame width is now
// confirmed real data (see comment above), but WHICH frame index shows which
// pose is still a visual judgment call with no research/bible source, so
// this is eyeballed from the raw strips: body frame 0 reads as the plainest
// neutral pose (no tilt/squash), so it's used for both idle and blink since
// a blink shouldn't move the body. Eyes frame 0 is the plain open-dot pose;
// the eyes frame used for blink is a guess at a flatter "closed" pair partway
// through the strip — least confident part of this guess, verify first.
// Mouth stays neutral (frame 0) for both, since blinking shouldn't move it.
const SEED_STATES = [
  { name: 'idle', variant: 'base', body: 0, eyes: 0, mouth: 0 },
  { name: 'blink', variant: 'base', body: 0, eyes: 9, mouth: 0 },
  // Walk lives on mini, not base — base's 20 body frames read as reaction
  // poses (bounce/blush/closed-eye), no leg motion. Body frames 12/13 show
  // an asymmetric mid-step leg pose against the static symmetric-legs pose
  // around them — originally logged as 13/14 (Taylor counted from 1, not
  // 0; shifted down by 1, same correction applied to sit_forward/sit_left/
  // sit_back below). Eyes/mouth held at neutral (0) for both — walking
  // shouldn't need a face change. Confirmed holding up across several
  // different-body-shape tamas, not just mametchi.
  { name: 'walk_left_1', variant: 'mini', body: 12, eyes: 0, mouth: 0 },
  { name: 'walk_left_2', variant: 'mini', body: 13, eyes: 0, mouth: 0 },
  // walk_right isn't a separate row — it's walk_left mirrored (Mirror
  // checkbox above), not a distinct sprite. See src/data/animationStates.json.
  //
  // Mini idle/blink — the production build uses mini, not base, so these
  // need their own mini-specific frames rather than reusing base's. Frame
  // 0 reads as the plain neutral pose here too (consistent with base).
  // Blink: mini eyes only has 14 frames total; cropped and upscaled all of
  // them on mametchi (tama #21, image-367.png) — frame 0 and 6 are open dot
  // eyes, frames 5 and 13 are both a clean flat closed-eye dash. Used 5.
  { name: 'idle', variant: 'mini', body: 0, eyes: 0, mouth: 0 },
  { name: 'blink', variant: 'mini', body: 0, eyes: 5, mouth: 0 },
  // New body-only poses from src/data/animationStates.json — eyes/mouth are
  // genuinely undefined there (different body orientation, face placement
  // not yet worked out) but this tool needs *some* frame to render a
  // preview, so these rows borrow idle's face (0, 0) purely so you can see
  // the body pose. That is NOT a real answer for where the face goes on a
  // sideways/backward-facing body — don't treat these eyes/mouth values as
  // meaningful, only the body frame is confirmed.
  { name: 'sit_forward', variant: 'mini', body: 6, eyes: 0, mouth: 0 },
  { name: 'sit_left', variant: 'mini', body: 7, eyes: 0, mouth: 0 },
  { name: 'sit_back', variant: 'mini', body: 18, eyes: 0, mouth: 0 },
];

export default function TamaAssembler() {
  const entities = useMemo(
    () => [{ id: 'egg', label: 'egg', ...atlas.egg }, ...atlas.tamas.map((t) => ({ ...t, label: `tama #${t.id}` }))],
    [],
  );

  const [entityIndex, setEntityIndex] = useState(1); // default to the first real tama, not the egg
  const [variant, setVariant] = useState('mini'); // production build uses mini, not base
  const [scale, setScale] = useState(6);
  const [mirrored, setMirrored] = useState(false);
  const [geom, setGeom] = useState(makeDefaultGeom);
  const [frames, setFrames] = useState({ body: 0, eyes: 0, mouth: 0 });
  const [states, setStates] = useState(SEED_STATES);
  const [stateName, setStateName] = useState('');
  const [activeLayer, setActiveLayer] = useState('body');
  const [previewStateName, setPreviewStateName] = useState('idle');
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(4);
  const [cycleIndex, setCycleIndex] = useState(0);

  const entity = entities[entityIndex];
  const info = VARIANT_INFO[variant];

  const files =
    variant === 'base'
      ? { body: entity.bodyBase, eyes: entity.eyesBase, mouth: entity.mouthBase }
      : { body: entity.bodyMini, eyes: entity.eyesMini, mouth: entity.mouthMini };

  // Per-tama TRUE offsets, baked into tamaAtlas.json from a real data.json
  // in a community Tamagotchi Paradise tool (Scalynko/TamaParaGenerator —
  // see git log for the derivation) whose body/eyes/mouth images are the
  // same native 64x64/64x32/64x32 firmware dimensions as our own sprite
  // sheets, so its EyePos/MouthPos coordinates transfer with zero scaling
  // — not an estimate or a proportional guess, the actual ground truth for
  // whichever real species name(s) matched this tama (see offsetSource /
  // offsetSourceNames). Loaded fresh on every entity/variant switch, still
  // fully overridable with the controls below.
  const suffix = variant === 'base' ? 'Base' : 'Mini';
  const bible =
    entity[`eyesOffsetX${suffix}`] != null
      ? {
          eyes: { x: entity[`eyesOffsetX${suffix}`], y: entity[`eyesOffsetY${suffix}`] },
          mouth: { x: entity[`mouthOffsetX${suffix}`], y: entity[`mouthOffsetY${suffix}`] },
        }
      : null; // egg has no bible entry

  useEffect(() => {
    if (!bible) return;
    setGeom((prev) => ({
      ...prev,
      [variant]: {
        ...prev[variant],
        eyes: { ...prev[variant].eyes, offsetX: bible.eyes.x, offsetY: bible.eyes.y },
        mouth: { ...prev[variant].mouth, offsetX: bible.mouth.x, offsetY: bible.mouth.y },
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityIndex, variant]);

  // Animation preview: plays through a named state from animationStates.json
  // (not the tool's own scratch SEED_STATES table below). All canonical
  // states are mini-only, so selecting one forces variant to mini and syncs
  // the Mirror checkbox for mirrorOf states like walk_right.
  const previewState = resolveAnimState(previewStateName);

  useEffect(() => {
    if (!previewState) return;
    setCycleIndex(0);
    setVariant('mini');
    setMirrored(previewState.mirror);
    setPlaying(true); // loop automatically on selection, no play click needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStateName]);

  useEffect(() => {
    if (!previewState) return;
    setFrames({
      body: previewState.body[cycleIndex % previewState.body.length],
      eyes: previewState.eyes[cycleIndex % previewState.eyes.length],
      mouth: previewState.mouth[cycleIndex % previewState.mouth.length],
    });
    // faceOffsetX/Y are a pixel nudge on top of the tama's normal bible
    // offset, not a different sprite frame — e.g. walk's constant sideways
    // shift to stay centered on the leaning body, plus a 1px up-shift on
    // the second step. Applied live over geom rather than baked into the
    // saved offset, so it doesn't stick around after leaving this state.
    if (bible) {
      const dx = previewState.faceOffsetX[cycleIndex % previewState.faceOffsetX.length];
      const dy = previewState.faceOffsetY[cycleIndex % previewState.faceOffsetY.length];
      setGeom((prev) => ({
        ...prev,
        [variant]: {
          ...prev[variant],
          eyes: { ...prev[variant].eyes, offsetX: bible.eyes.x + dx, offsetY: bible.eyes.y + dy },
          mouth: { ...prev[variant].mouth, offsetX: bible.mouth.x + dx, offsetY: bible.mouth.y + dy },
        },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStateName, cycleIndex]);

  useEffect(() => {
    if (!playing || !previewState) return;
    const frameCount = Math.max(previewState.body.length, previewState.eyes.length, previewState.mouth.length);
    if (frameCount <= 1) return; // nothing to animate, e.g. idle
    const id = setInterval(() => setCycleIndex((i) => (i + 1) % frameCount), 1000 / fps);
    return () => clearInterval(id);
  }, [playing, previewStateName, fps]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateLayerGeom(layer, patch) {
    setGeom((prev) => ({ ...prev, [variant]: { ...prev[variant], [layer]: { ...prev[variant][layer], ...patch } } }));
  }

  function setFrame(layer, value) {
    const l = info.layers[layer];
    const count = Math.max(1, Math.floor(l.sheetWidth / geom[variant][layer].frameWidth));
    setFrames((prev) => ({ ...prev, [layer]: ((value % count) + count) % count }));
  }

  // Hover a layer to make it "active", then:
  //   ←/→        step that layer's frame
  //   Shift+←/→  nudge that layer's frame width
  //   Ctrl+←/→   nudge that layer's horizontal offset (eyes/mouth only)
  //   ↑/↓        nudge that layer's vertical offset (eyes/mouth only)
  // Ignored while a text/number input has focus so typing still works normally.
  useEffect(() => {
    function nudgeOffset(layer, axis, dir) {
      setGeom((prev) => ({
        ...prev,
        [variant]: { ...prev[variant], [layer]: { ...prev[variant][layer], [axis]: prev[variant][layer][axis] + dir } },
      }));
    }

    function onKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const layer = activeLayer;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        if (e.shiftKey) {
          setGeom((prev) => {
            const nextWidth = Math.max(1, prev[variant][layer].frameWidth + dir);
            return { ...prev, [variant]: { ...prev[variant], [layer]: { ...prev[variant][layer], frameWidth: nextWidth } } };
          });
        } else if (e.ctrlKey && layer !== 'body') {
          nudgeOffset(layer, 'offsetX', dir);
        } else if (!e.ctrlKey) {
          setFrames((prev) => {
            const width = geom[variant][layer].frameWidth;
            const count = Math.max(1, Math.floor(info.layers[layer].sheetWidth / width));
            const next = ((prev[layer] + dir) % count + count) % count;
            return { ...prev, [layer]: next };
          });
        }
      } else if (layer !== 'body') {
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        nudgeOffset(layer, 'offsetY', dir);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [variant, activeLayer, geom, info]);

  function captureState() {
    if (!stateName.trim()) return;
    setStates((prev) => [
      ...prev,
      { name: stateName.trim(), variant, body: frames.body, eyes: frames.eyes, mouth: frames.mouth },
    ]);
    setStateName('');
  }

  function removeState(i) {
    setStates((prev) => prev.filter((_, idx) => idx !== i));
  }

  function loadState(s) {
    // Older captured states (before variant tracking) have no `variant` —
    // assume they're from whatever variant is currently selected rather
    // than silently misapplying base frame indices to the mini sheet or
    // vice versa.
    if (s.variant && s.variant !== variant) setVariant(s.variant);
    setFrames({ body: s.body, eyes: s.eyes, mouth: s.mouth });
  }

  function exportStates() {
    const payload = { entity: entity.label, variant, geom: geom[variant], states };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tama-states-${entity.label.replace(/\s+/g, '-')}-${variant}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const layerNames = ['body', 'eyes', 'mouth'];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, color: '#eee', background: '#1a1a1a', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>Tama sprite assembler (dev tool)</h1>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0, marginBottom: 16, maxWidth: 640 }}>
        Body, eyes and mouth step independently — a state is whichever combination of the three looks right, not
        necessarily matching frame indices. Tune frame width per layer, step to a pose, name it, and capture it.
        <br />
        Hover a layer (highlighted below) and use <strong>←/→</strong> to step its frame, <strong>Shift+←/→</strong> to
        nudge its frame width, <strong>Ctrl+←/→</strong> / <strong>↑/↓</strong> to nudge horizontal/vertical position
        (eyes/mouth only).
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label>
          Entity:{' '}
          <select value={entityIndex} onChange={(e) => setEntityIndex(Number(e.target.value))}>
            {entities.map((e, i) => (
              <option key={e.id} value={i}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        {entity.offsetSourceNames?.length > 0 && (
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            bible match: {entity.offsetSourceNames.join(', ')}
          </span>
        )}

        <label>
          Variant:{' '}
          <select
            value={variant}
            onChange={(e) => {
              setVariant(e.target.value);
              setFrames({ body: 0, eyes: 0, mouth: 0 });
            }}
          >
            <option value="base">base</option>
            <option value="mini">mini</option>
          </select>
        </label>

        <label>
          Scale: <input type="number" min={1} max={16} value={scale} onChange={(e) => setScale(Number(e.target.value) || 1)} style={{ width: 48 }} />
        </label>

        <label>
          <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} /> Mirror (preview facing the other
          way)
        </label>

        <button onClick={exportStates}>Export states JSON</button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 16,
          padding: 8,
          border: '1px solid #444',
          borderRadius: 4,
        }}
      >
        <strong style={{ fontSize: 12 }}>Animation preview</strong>
        <label>
          State:{' '}
          <select
            value={previewStateName}
            onChange={(e) => setPreviewStateName(e.target.value)}
          >
            {Object.keys(animationStates)
              .filter((k) => k !== '_comment')
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <button onClick={() => setPlaying((p) => !p)} disabled={!previewState || previewState.body.length <= 1}>
          {playing ? '⏸ pause' : '▶ play'}
        </button>
        <label>
          fps: <input type="number" min={1} max={30} value={fps} onChange={(e) => setFps(Number(e.target.value) || 1)} style={{ width: 40 }} />
        </label>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          frame {cycleIndex + 1} / {previewState ? Math.max(previewState.body.length, previewState.eyes.length, previewState.mouth.length) : 1}
          {previewState?.mirror && ' (mirrored)'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
            composited frame{mirrored ? ' (mirrored)' : ''}
          </div>
          <div
            style={{
              position: 'relative',
              width: info.layers.body.defaultFrameWidth * scale,
              height: info.canvasHeight * scale,
              background: '#4443',
              outline: '1px dashed #666',
              marginBottom: 8,
              transform: mirrored ? 'scaleX(-1)' : undefined,
            }}
          >
            {layerNames.map((layer) => (
              <Cropped
                key={layer}
                file={files[layer]}
                frameWidth={geom[variant][layer].frameWidth}
                sheetHeight={info.layers[layer].sheetHeight}
                frameIndex={frames[layer]}
                offsetX={geom[variant][layer].offsetX}
                offsetY={geom[variant][layer].offsetY}
                scale={scale}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="state name (e.g. idle)"
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              style={{ width: 160 }}
            />
            <button onClick={captureState}>Capture as state</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {layerNames.map((layer) => {
          const l = info.layers[layer];
          const g = geom[variant][layer];
          const count = Math.max(1, Math.floor(l.sheetWidth / g.frameWidth));
          const active = layer === activeLayer;
          return (
            <div
              key={layer}
              data-layer={layer}
              onMouseEnter={() => setActiveLayer(layer)}
              style={{
                padding: 8,
                borderRadius: 4,
                outline: active ? '2px solid #6cf' : '2px solid transparent',
                background: active ? '#6cf1' : 'transparent',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: 4, textTransform: 'capitalize' }}>{layer}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <label>
                  width: <input type="number" min={1} value={g.frameWidth} onChange={(e) => updateLayerGeom(layer, { frameWidth: Number(e.target.value) || 1 })} style={{ width: 48 }} />
                </label>
                {layer !== 'body' && (
                  <>
                    <label>
                      offsetX: <input type="number" value={g.offsetX} onChange={(e) => updateLayerGeom(layer, { offsetX: Number(e.target.value) || 0 })} style={{ width: 48 }} />
                    </label>
                    <label>
                      offsetY: <input type="number" value={g.offsetY} onChange={(e) => updateLayerGeom(layer, { offsetY: Number(e.target.value) || 0 })} style={{ width: 48 }} />
                    </label>
                    {bible && (layer === 'eyes' || layer === 'mouth') && (
                      <span style={{ fontSize: 11, opacity: 0.6 }}>
                        (bible: x{bible[layer].x} y{bible[layer].y}
                        {(g.offsetX !== bible[layer].x || g.offsetY !== bible[layer].y) && (
                          <>
                            {' — '}
                            <button
                              style={{ fontSize: 11 }}
                              onClick={() => updateLayerGeom(layer, { offsetX: bible[layer].x, offsetY: bible[layer].y })}
                            >
                              reset
                            </button>
                          </>
                        )}
                        )
                      </span>
                    )}
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <button onClick={() => setFrame(layer, frames[layer] - 1)}>&larr;</button>
                <span>
                  {frames[layer]} / {count - 1}
                </span>
                <button onClick={() => setFrame(layer, frames[layer] + 1)}>&rarr;</button>
              </div>
              <SheetWithGrid
                file={files[layer]}
                frameWidth={g.frameWidth}
                frameIndex={frames[layer]}
                label={layer}
                sheetWidth={l.sheetWidth}
                sheetHeight={l.sheetHeight}
              />
            </div>
          );
        })}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Captured states ({states.length})</div>
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['name', 'variant', 'body', 'eyes', 'mouth', ''].map((h) => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #555', padding: '2px 8px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {states.map((s, i) => (
              <tr key={i}>
                <td style={{ padding: '2px 8px' }}>{s.name}</td>
                <td style={{ padding: '2px 8px', opacity: s.variant ? 1 : 0.5 }}>{s.variant ?? '(unset)'}</td>
                <td style={{ padding: '2px 8px' }}>{s.body}</td>
                <td style={{ padding: '2px 8px' }}>{s.eyes}</td>
                <td style={{ padding: '2px 8px' }}>{s.mouth}</td>
                <td style={{ padding: '2px 8px' }}>
                  <button onClick={() => loadState(s)}>load</button> <button onClick={() => removeState(i)}>delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

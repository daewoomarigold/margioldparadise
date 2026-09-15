// Dev-only tool: composites a tama's body/eyes/mouth sprite sheets together.
// The three sheets are independent — a "state" (idle, happy, walk, ...) is a
// hand-picked combination of one frame from each, e.g. idle = b0 + e0 + m0.
// This tool lets you step each layer separately, see the composite live, and
// capture named states into a table you can export.
//
// Not part of the production build — see the DEV-gated import in main.jsx.
// Open with: npm run dev, then visit /?dev=assembler

import { useEffect, useMemo, useRef, useState } from 'react';
import atlas from '../data/tamaAtlas.json';

const SPRITE_BASE = `${import.meta.env.BASE_URL}sprites/`;

// Confirmed from real file dimensions AND reference/catalog.json's per-file
// subimages (frame count) field — not guessed, and cross-checked against
// all 68 tamas, not just one: base sheets are body 1280x64 (20 frames @
// 64px) / eyes 1280x32 (20 @ 64px) / mouth 1152x32 (18 @ 64px); mini sheets
// are body 768x32 (24 @ 32px) / eyes 448x16 (14 @ 32px) / mouth 448x16
// (14 @ 32px). Frame width defaults below reflect this.
//
// offsetX/offsetY are GLOBAL, not per-tama: measuring opaque-pixel bounding
// boxes across several tamas showed eyes/mouth content sits at a consistent
// local position within their own sheet regardless of which tama, while
// body shape varies a lot — meaning character-specific variation lives in
// the art itself, not in a per-character offset (confirmed by mouth's
// offsetY:32 — exactly half the 64px canvas — already looking right across
// differently-shaped bodies without per-tama adjustment). So one tuned
// value per layer should work everywhere; no need to redo this per tama.
// mouth offsetY (32 base / 16 mini) is user-confirmed correct. eyes offsetY
// (20 base / 10 mini) is a first estimate derived from bounding-box math,
// not yet confirmed — verify live and adjust if needed.
const VARIANT_INFO = {
  base: {
    canvasHeight: 64,
    layers: {
      body: { sheetWidth: 1280, sheetHeight: 64, defaultFrameWidth: 64, defaultOffsetX: 0, defaultOffsetY: 0 },
      eyes: { sheetWidth: 1280, sheetHeight: 32, defaultFrameWidth: 64, defaultOffsetX: 0, defaultOffsetY: 20 },
      mouth: { sheetWidth: 1152, sheetHeight: 32, defaultFrameWidth: 64, defaultOffsetX: 0, defaultOffsetY: 32 },
    },
  },
  mini: {
    canvasHeight: 32,
    layers: {
      body: { sheetWidth: 768, sheetHeight: 32, defaultFrameWidth: 32, defaultOffsetX: 0, defaultOffsetY: 0 },
      eyes: { sheetWidth: 448, sheetHeight: 16, defaultFrameWidth: 32, defaultOffsetX: 0, defaultOffsetY: 10 },
      mouth: { sheetWidth: 448, sheetHeight: 16, defaultFrameWidth: 32, defaultOffsetX: 0, defaultOffsetY: 16 },
    },
  },
};

function spriteUrl(file) {
  return `${SPRITE_BASE}${file}`;
}

function makeDefaultGeom() {
  const geom = {};
  for (const [variant, info] of Object.entries(VARIANT_INFO)) {
    geom[variant] = {};
    for (const [layer, l] of Object.entries(info.layers)) {
      geom[variant][layer] = { frameWidth: l.defaultFrameWidth, offsetX: l.defaultOffsetX, offsetY: l.defaultOffsetY };
    }
  }
  return geom;
}

// Renders one horizontal slice of a sprite sheet, scaled up and pixelated.
// offsetX/offsetY nudge a smaller eyes/mouth strip to sit at the right spot
// within the taller/wider body canvas.
function Cropped({ file, frameWidth, sheetHeight, frameIndex, offsetX = 0, offsetY = 0, scale }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: frameWidth * scale,
        height: sheetHeight * scale,
        overflow: 'hidden',
        transform: `translate(${offsetX * scale}px, ${offsetY * scale}px)`,
      }}
    >
      <img
        src={spriteUrl(file)}
        style={{
          position: 'absolute',
          left: -frameIndex * frameWidth * scale,
          top: 0,
          imageRendering: 'pixelated',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
}

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

// A first best guess, seeded so you have something to correct rather than a
// blank table. Indices assume frameWidth=64 (base) — adjust once real frame
// width is confirmed. Based on eyeballing image-237/238/239 (baby, id 0):
// body has ~20 frames mostly idle-bob poses with one raised/mid-step pose
// and two blush-cheek poses near the end; eyes cycle through plain dots,
// ^ ^ (content), > < (annoyed), closed dashes, and heart/note marks; mouth
// (only 18 frames) has a similar small/neutral/open/frown set.
const SEED_STATES = [
  { name: 'idle', body: 0, eyes: 0, mouth: 0 },
  { name: 'blink', body: 0, eyes: 13, mouth: 0 },
  { name: 'happy', body: 18, eyes: 2, mouth: 3 },
  { name: 'sad', body: 14, eyes: 9, mouth: 8 },
  { name: 'walk', body: 12, eyes: 0, mouth: 0 },
];

export default function TamaAssembler() {
  const entities = useMemo(
    () => [{ id: 'egg', label: 'egg', ...atlas.egg }, ...atlas.tamas.map((t) => ({ ...t, label: `tama #${t.id}` }))],
    [],
  );

  const [entityIndex, setEntityIndex] = useState(1); // default to the first real tama, not the egg
  const [variant, setVariant] = useState('base');
  const [scale, setScale] = useState(6);
  const [geom, setGeom] = useState(makeDefaultGeom);
  const [frames, setFrames] = useState({ body: 0, eyes: 0, mouth: 0 });
  const [states, setStates] = useState(SEED_STATES);
  const [stateName, setStateName] = useState('');
  const [activeLayer, setActiveLayer] = useState('body');
  const layersRef = useRef(null);

  const entity = entities[entityIndex];
  const info = VARIANT_INFO[variant];

  const files =
    variant === 'base'
      ? { body: entity.bodyBase, eyes: entity.eyesBase, mouth: entity.mouthBase }
      : { body: entity.bodyMini, eyes: entity.eyesMini, mouth: entity.mouthMini };

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

  // Scroll wheel over any layer's sheet steps that layer's frame directly,
  // without needing to hover-then-switch-to-arrow-keys first.
  useEffect(() => {
    const el = layersRef.current;
    if (!el) return;
    function onWheel(e) {
      const target = e.target.closest?.('[data-layer]');
      if (!target) return;
      e.preventDefault();
      const layer = target.dataset.layer;
      setActiveLayer(layer);
      const dir = e.deltaY > 0 ? 1 : -1;
      setFrames((prev) => {
        const width = geom[variant][layer].frameWidth;
        const count = Math.max(1, Math.floor(info.layers[layer].sheetWidth / width));
        const next = ((prev[layer] + dir) % count + count) % count;
        return { ...prev, [layer]: next };
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [variant, geom, info]);

  function captureState() {
    if (!stateName.trim()) return;
    setStates((prev) => [...prev, { name: stateName.trim(), body: frames.body, eyes: frames.eyes, mouth: frames.mouth }]);
    setStateName('');
  }

  function removeState(i) {
    setStates((prev) => prev.filter((_, idx) => idx !== i));
  }

  function loadState(s) {
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
        (eyes/mouth only) — or just scroll over any sheet to step it directly.
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

        <button onClick={exportStates}>Export states JSON</button>
      </div>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>composited frame</div>
          <div
            style={{
              position: 'relative',
              width: info.layers.body.defaultFrameWidth * scale,
              height: info.canvasHeight * scale,
              background: '#4443',
              outline: '1px dashed #666',
              marginBottom: 8,
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

        <div ref={layersRef} style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
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
              {['name', 'body', 'eyes', 'mouth', ''].map((h) => (
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

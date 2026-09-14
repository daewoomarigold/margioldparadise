// Dev-only tool: composites a tama's body/eyes/mouth sprite sheets together
// so we can figure out real frame geometry (frame width, how eyes/mouth
// layer onto the body canvas) by eye, and step through animation frames to
// sanity-check alignment.
//
// Not part of the production build — see the DEV-gated import in main.jsx.
// Open with: npm run dev, then visit /?dev=assembler
//
// Once the geometry looks right, the confirmed numbers (frame width, layer
// offsets) should get hardcoded into the real sprite-rendering code and this
// tool's job here is done.

import { useMemo, useState } from 'react';
import atlas from '../data/tamaAtlas.json';

const SPRITE_BASE = `${import.meta.env.BASE_URL}sprites/`;

// Starting guesses — tune live with the controls below, then report back
// the values that actually line up.
const DEFAULTS = {
  base: { frameWidth: 64, frameHeight: 64, eyesOffsetY: 0, mouthOffsetY: 32 },
  mini: { frameWidth: 32, frameHeight: 32, eyesOffsetY: 0, mouthOffsetY: 16 },
};

function spriteUrl(file) {
  return `${SPRITE_BASE}${file}`;
}

// Renders one horizontal slice of a sprite sheet at `frameIndex`, scaled up
// and pixelated. `offsetY` lets a shorter eyes/mouth strip be nudged to sit
// at the right vertical spot within the body's taller frame.
function Cropped({ file, frameWidth, sheetHeight, frameIndex, offsetY = 0, scale }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: frameWidth * scale,
        height: sheetHeight * scale,
        overflow: 'hidden',
        transform: `translateY(${offsetY * scale}px)`,
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
// can visually confirm the frame width lines up with the art before trusting
// the cropped composite above.
function SheetWithGrid({ file, frameWidth, label }) {
  const [natural, setNatural] = useState(null);
  const displayScale = 2;
  const lineCount = natural ? Math.floor(natural.w / frameWidth) : 0;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>
        {label} — {file}
        {natural ? ` (${natural.w}×${natural.h})` : ''}
      </div>
      <div style={{ position: 'relative', display: 'inline-block', background: '#4443', lineHeight: 0 }}>
        <img
          src={spriteUrl(file)}
          onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          style={{
            imageRendering: 'pixelated',
            width: natural ? natural.w * displayScale : undefined,
            height: natural ? natural.h * displayScale : undefined,
            display: 'block',
          }}
        />
        {natural &&
          Array.from({ length: lineCount + 1 }, (_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: i * frameWidth * displayScale,
                top: 0,
                width: 1,
                height: natural.h * displayScale,
                background: 'rgba(255,0,0,0.5)',
              }}
            />
          ))}
      </div>
    </div>
  );
}

export default function TamaAssembler() {
  const entities = useMemo(() => [{ id: 'egg', label: 'egg', ...atlas.egg }, ...atlas.tamas.map((t) => ({ ...t, label: `tama #${t.id}` }))], []);

  const [entityIndex, setEntityIndex] = useState(1); // default to the first real tama, not the egg
  const [variant, setVariant] = useState('base'); // 'base' | 'mini'
  const [frameIndex, setFrameIndex] = useState(0);
  const [scale, setScale] = useState(6);
  const [geom, setGeom] = useState(DEFAULTS);

  const entity = entities[entityIndex];
  const g = geom[variant];

  const files =
    variant === 'base'
      ? { body: entity.bodyBase, eyes: entity.eyesBase, mouth: entity.mouthBase }
      : { body: entity.bodyMini, eyes: entity.eyesMini, mouth: entity.mouthMini };

  const bodySheetWidth = variant === 'base' ? 1280 : 768; // confirmed real widths of the body-base / body-mini sheets
  const frameCount = Math.max(1, Math.floor(bodySheetWidth / g.frameWidth));

  function updateGeom(patch) {
    setGeom((prev) => ({ ...prev, [variant]: { ...prev[variant], ...patch } }));
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, color: '#eee', background: '#1a1a1a', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>Tama sprite assembler (dev tool)</h1>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0, marginBottom: 16 }}>
        Composites body + eyes + mouth sheets and steps through frames. Tune the numbers below until the layers line up, then
        report the values back so they can be hardcoded.
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
          <select value={variant} onChange={(e) => { setVariant(e.target.value); setFrameIndex(0); }}>
            <option value="base">base</option>
            <option value="mini">mini</option>
          </select>
        </label>

        <label>
          Scale: <input type="number" min={1} max={16} value={scale} onChange={(e) => setScale(Number(e.target.value) || 1)} style={{ width: 48 }} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label>
          Frame width:{' '}
          <input
            type="number"
            min={1}
            value={g.frameWidth}
            onChange={(e) => updateGeom({ frameWidth: Number(e.target.value) || 1 })}
            style={{ width: 56 }}
          />
        </label>
        <label>
          Frame height:{' '}
          <input
            type="number"
            min={1}
            value={g.frameHeight}
            onChange={(e) => updateGeom({ frameHeight: Number(e.target.value) || 1 })}
            style={{ width: 56 }}
          />
        </label>
        <label>
          Eyes offset Y:{' '}
          <input type="number" value={g.eyesOffsetY} onChange={(e) => updateGeom({ eyesOffsetY: Number(e.target.value) || 0 })} style={{ width: 56 }} />
        </label>
        <label>
          Mouth offset Y:{' '}
          <input type="number" value={g.mouthOffsetY} onChange={(e) => updateGeom({ mouthOffsetY: Number(e.target.value) || 0 })} style={{ width: 56 }} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => setFrameIndex((i) => Math.max(0, i - 1))}>&larr; prev</button>
        <span>
          frame {frameIndex} / {frameCount - 1}
        </span>
        <button onClick={() => setFrameIndex((i) => Math.min(frameCount - 1, i + 1))}>next &rarr;</button>
      </div>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>composited frame</div>
          <div
            style={{
              position: 'relative',
              width: g.frameWidth * scale,
              height: g.frameHeight * scale,
              background: '#4443',
              outline: '1px dashed #666',
            }}
          >
            <Cropped file={files.body} frameWidth={g.frameWidth} sheetHeight={g.frameHeight} frameIndex={frameIndex} scale={scale} />
            <Cropped
              file={files.eyes}
              frameWidth={g.frameWidth}
              sheetHeight={g.frameHeight / 2}
              frameIndex={frameIndex}
              offsetY={g.eyesOffsetY}
              scale={scale}
            />
            <Cropped
              file={files.mouth}
              frameWidth={g.frameWidth}
              sheetHeight={g.frameHeight / 2}
              frameIndex={frameIndex}
              offsetY={g.mouthOffsetY}
              scale={scale}
            />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>raw sheets, gridlines every frameWidth px</div>
          <SheetWithGrid file={files.body} frameWidth={g.frameWidth} label="body" />
          <SheetWithGrid file={files.eyes} frameWidth={g.frameWidth} label="eyes" />
          <SheetWithGrid file={files.mouth} frameWidth={g.frameWidth} label="mouth" />
        </div>
      </div>
    </div>
  );
}

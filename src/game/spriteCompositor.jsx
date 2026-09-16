// Sprite-compositing React components — used by both the dev assembler
// tool (src/dev/TamaAssembler.jsx) and real app views (e.g. the island).
// Kept in one place so the two never drift apart. See spriteData.js for
// the geometry/lookup data and pure helper functions these build on.

import { spriteUrl, VARIANT_INFO, getTamaEntity, getSpriteFiles, getBibleOffsets } from './spriteData.js';

// Renders one horizontal slice of a sprite sheet, scaled up and pixelated.
// offsetX/offsetY nudge a smaller eyes/mouth strip to sit at the right spot
// within the taller/wider body canvas.
export function Cropped({ file, frameWidth, sheetHeight, frameIndex, offsetX = 0, offsetY = 0, scale }) {
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

// High-level composite: body+eyes+mouth layered for one tama, one variant,
// one frame-per-layer, at real bible offsets (falling back to VARIANT_INFO
// defaults if this tama has none, e.g. the egg). Wrap in a container sized
// frameWidth*scale x canvasHeight*scale; this renders absolutely within it.
// mirrored flips the whole composite horizontally (CSS scaleX(-1)) for
// e.g. walk_right, which is walk_left's data reused, not separate frames.
// faceOffset ({x, y}, optional) adds an extra per-frame pixel nudge to
// eyes+mouth on top of the bible offset — e.g. an animation state's
// faceOffsetX/Y (see resolveAnimState in spriteData.js) for the walk
// cycle's lean-compensation and step up-shift. Not applied to body.
export function TamaComposite({ tamaId, variant, frames, scale, mirrored = false, faceOffset }) {
  const entity = getTamaEntity(tamaId);
  if (!entity) return null;
  const info = VARIANT_INFO[variant];
  const files = getSpriteFiles(entity, variant);
  const bible = getBibleOffsets(entity, variant);
  const frameWidth = info.layers.body.defaultFrameWidth;

  function offsetFor(layer) {
    const fallback = { x: info.layers[layer].defaultOffsetX, y: info.layers[layer].defaultOffsetY };
    const base = bible ? (bible[layer] ?? fallback) : fallback;
    if (!faceOffset) return base;
    return { x: base.x + faceOffset.x, y: base.y + faceOffset.y };
  }

  return (
    <div
      style={{
        position: 'relative',
        width: frameWidth * scale,
        height: info.canvasHeight * scale,
        transform: mirrored ? 'scaleX(-1)' : undefined,
      }}
    >
      {['body', 'eyes', 'mouth'].map((layer) => {
        const off = layer === 'body' ? { x: 0, y: 0 } : offsetFor(layer);
        return (
          <Cropped
            key={layer}
            file={files[layer]}
            frameWidth={frameWidth}
            sheetHeight={info.layers[layer].sheetHeight}
            frameIndex={frames[layer] ?? 0}
            offsetX={off.x}
            offsetY={off.y}
            scale={scale}
          />
        );
      })}
    </div>
  );
}

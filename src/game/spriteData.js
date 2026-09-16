// Sprite geometry/lookup data + pure helper functions — no React components
// here (see spriteCompositor.jsx for those), just so fast-refresh doesn't
// warn about mixing components and non-component exports in one file.

import atlas from '../data/tamaAtlas.json';
import animationStates from '../data/animationStates.json';

export const SPRITE_BASE = `${import.meta.env.BASE_URL}sprites/`;

export function spriteUrl(file) {
  return `${SPRITE_BASE}${file}`;
}

// Confirmed from real file dimensions AND reference/catalog.json's per-file
// subimages (frame count) field — not guessed, and cross-checked against
// all 68 tamas, not just one: base sheets are body 1280x64 (20 frames @
// 64px) / eyes 1280x32 (20 @ 64px) / mouth 1152x32 (18 @ 64px); mini sheets
// are body 768x32 (24 @ 32px) / eyes 448x16 (14 @ 32px) / mouth 448x16
// (14 @ 32px).
//
// eyes/mouth offsetX/offsetY defaults here are just a fallback shape (see
// makeDefaultGeom) — real per-tama values come from Scalynko/
// TamaParaGenerator's data.json (a community Tamagotchi Paradise tool),
// baked into tamaAtlas.json per tama (eyesOffsetX/Y + mouthOffsetX/Y,
// Base/Mini). See TamaAssembler's header comment for the full story.
export const VARIANT_INFO = {
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

export function makeDefaultGeom() {
  const geom = {};
  for (const [variant, info] of Object.entries(VARIANT_INFO)) {
    geom[variant] = {};
    for (const [layer, l] of Object.entries(info.layers)) {
      geom[variant][layer] = { frameWidth: l.defaultFrameWidth, offsetX: l.defaultOffsetX, offsetY: l.defaultOffsetY };
    }
  }
  return geom;
}

// Looks up a tama's sprite filenames + per-variant bible offsets from
// tamaAtlas.json by tamaId (index into atlas.tamas), or 'egg' for the
// separate egg entry (which has no bible offsets — it has no face).
export function getTamaEntity(tamaId) {
  if (tamaId === 'egg') return { id: 'egg', ...atlas.egg };
  const entity = atlas.tamas[tamaId];
  if (!entity) return null;
  return entity;
}

export function getSpriteFiles(entity, variant) {
  return variant === 'base'
    ? { body: entity.bodyBase, eyes: entity.eyesBase, mouth: entity.mouthBase }
    : { body: entity.bodyMini, eyes: entity.eyesMini, mouth: entity.mouthMini };
}

// Real per-tama bible offsets baked into tamaAtlas.json, or null (e.g. for
// the egg, which has none — falls back to VARIANT_INFO's defaults).
export function getBibleOffsets(entity, variant) {
  const suffix = variant === 'base' ? 'Base' : 'Mini';
  const x = entity[`eyesOffsetX${suffix}`];
  if (x == null) return null;
  return {
    eyes: { x, y: entity[`eyesOffsetY${suffix}`] },
    mouth: { x: entity[`mouthOffsetX${suffix}`], y: entity[`mouthOffsetY${suffix}`] },
  };
}

// Resolves a named entry from animationStates.json into a playable shape:
// { body: [...], eyes: [...], mouth: [...], faceOffsetX/Y: [...], mirror }.
// Handles mirrorOf (e.g. walk_right) by pulling the referenced state's
// frames instead of duplicating them, matching how the data file stores
// it. eyes/mouth of null (face not yet defined for that body pose) fall
// back to [0] so there's something to render — not a real answer, just a
// way to avoid crashing. faceOffsetX/Y are a per-cycle-frame pixel delta
// on top of the tama's normal eyes/mouth offset (not a different sprite
// frame) — e.g. walk's constant sideways shift to stay centered on the
// leaning body, plus a subtle up-shift on the second step frame; default
// to no shift.
export function resolveAnimState(name) {
  const raw = animationStates[name];
  if (!raw) return null;
  const target = raw.mirrorOf ? animationStates[raw.mirrorOf] : raw;
  if (!target) return null;
  return {
    body: target.body,
    eyes: target.eyes ?? [0],
    mouth: target.mouth ?? [0],
    faceOffsetX: target.faceOffsetX ?? [0],
    faceOffsetY: target.faceOffsetY ?? [0],
    mirror: Boolean(raw.mirrorOf),
  };
}

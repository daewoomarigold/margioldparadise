// Walkable-region definition for a specific background, so movement.js's
// physics can stay background-agnostic (it just asks "what's the Y range
// I'm allowed in at this X?" rather than knowing about grass/river/forest
// itself). Mapped by eye against a labeled coordinate grid overlaid on the
// image (512x512 native) — see git history for the grid screenshot this
// was read from if it ever needs re-deriving.
//
// image-683.png's layout: sky/mountains y<195 (not walkable), a grass
// field y~195-285 across the full width but with forest trees intruding
// from the upper-right (~x 370-512, y 130-260), then a river ~y 285-380,
// then a lower grass strip + bottom hedges. This first pass only uses the
// upper grass field — avoiding the river and bottom hedges entirely rather
// than trying to model a crossing — with the forest carved out as a
// narrower Y range on the right side.

const BASE_MIN_Y = 200;
const BASE_MAX_Y = 278;
const FOREST_X_START = 365; // right side, trees start intruding from here
const FOREST_MIN_Y = 258; // top boundary pushed down (forest occupies the space above)

// Returns the allowed [minY, maxY] for a roamer's sprite TOP-LEFT corner at
// horizontal position x (not accounting for sprite width — movement.js
// still clamps x separately against the canvas edges). Inset by roughly
// half a mini sprite width/height so the sprite itself (not just its
// corner) stays visually within the grass, not just its anchor point.
export function getYBoundsForImage683(x, spriteWidth, spriteHeight) {
  const inForestZone = x + spriteWidth > FOREST_X_START;
  const minY = inForestZone ? FOREST_MIN_Y : BASE_MIN_Y;
  const maxY = BASE_MAX_Y - spriteHeight * 0.4; // keep feet roughly on grass, not sinking toward the riverbank
  return { minY, maxY: Math.max(minY, maxY) };
}

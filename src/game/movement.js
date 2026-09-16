// Roaming movement physics — ported from the old gotchigarden.html's Pet
// class (see the gotchigarden repo, same project's previous rewrite).
// Original used a canvas + imperative Pet class; this is the same math as
// plain mutable-object functions instead, since the island renders via DOM
// (reusing TamaComposite) rather than canvas.
//
// Shape: mostly-horizontal wandering confined to a "ground band" at the
// bottom of the screen (the old code's minY/maxY), with vy scaled to 25%
// of vx's magnitude for a flattened side-view walk rather than free 2D
// movement, smooth steering (velocity eases toward a target instead of
// snapping), periodic re-aiming with a chance to stop and stand still, and
// boundary bouncing at the edges of both the ground band and the screen.

// Fraction of canvas height where the "ground" starts — matches the old
// code's 0.65 (tamas only wander in the bottom ~35% of the screen, leaving
// sky/background scenery above untouched).
const GROUND_FRACTION = 0.65;

function randomAngle() {
  // Mostly facing left or right (0 or PI) with a bit of random spread,
  // not fully omnidirectional — matches the old code and suits a sprite
  // that only has one horizontal facing (mirrored for the other side).
  return (Math.random() > 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.6;
}

function randomSpeed() {
  return 0.9 + Math.random() * 0.675;
}

export function createRoamer({ id, canvasWidth, canvasHeight, spriteWidth, spriteHeight }) {
  const minY = Math.floor(canvasHeight * GROUND_FRACTION);
  const maxY = Math.max(minY, canvasHeight - spriteHeight - 4);
  const angle = randomAngle();
  const speed = randomSpeed();
  return {
    id,
    x: 10 + Math.random() * Math.max(0, canvasWidth - spriteWidth - 20),
    y: minY + Math.random() * Math.max(0, maxY - minY),
    vx: Math.cos(angle) * speed,
    vy: 0,
    angle,
    speed,
    facingRight: Math.cos(angle) > 0,
    state: 'walk', // 'walk' | 'stand'
    stateTimer: 30 + Math.floor(Math.random() * 60),
    steerTimer: 30 + Math.floor(Math.random() * 60),
    minY,
    maxY,
    spriteWidth,
    spriteHeight,
    animFrame: 0, // which walk_left frame (0/1) is currently showing
    animTimer: 0,
  };
}

// Mutates `r` in place (matches the old code's style — called once per
// roamer per animation frame; not worth the allocation churn of returning
// new objects 60x/sec for a handful of on-screen tamas). dt is seconds
// since last frame; canvasWidth lets roamers bounce off the current
// container size (e.g. after a window resize).
export function stepRoamer(r, dt, canvasWidth) {
  if (r.state === 'stand') {
    r.stateTimer -= dt * 60;
    if (r.stateTimer <= 0) {
      r.state = 'walk';
      r.steerTimer = 30 + Math.random() * 60;
    }
    return r;
  }

  r.steerTimer -= dt * 60;
  if (r.steerTimer <= 0) {
    if (Math.random() < 0.15) {
      r.state = 'stand';
      r.stateTimer = 20 + Math.random() * 30;
      r.vx = 0;
      r.vy = 0;
      return r;
    }
    const turn = (Math.random() - 0.5) * Math.PI * 0.78;
    r.angle += turn;
    r.speed = randomSpeed();
    r.steerTimer = 30 + Math.random() * 60;
  }

  const steer = 0.08;
  const targetVx = Math.cos(r.angle) * r.speed;
  const targetVy = Math.sin(r.angle) * r.speed * 0.25;
  r.vx += (targetVx - r.vx) * steer;
  r.vy += (targetVy - r.vy) * steer;
  r.x += r.vx * dt * 60;
  r.y += r.vy * dt * 60;

  if (r.x <= 0) {
    r.x = 0;
    r.vx = Math.abs(r.vx);
    r.angle = Math.atan2(r.vy, Math.abs(r.vx));
  }
  if (r.x >= canvasWidth - r.spriteWidth) {
    r.x = canvasWidth - r.spriteWidth;
    r.vx = -Math.abs(r.vx);
    r.angle = Math.atan2(r.vy, -Math.abs(r.vx));
  }
  if (r.y <= r.minY) {
    r.y = r.minY;
    r.vy = Math.abs(r.vy);
    r.angle = Math.atan2(Math.abs(r.vy), r.vx);
  }
  if (r.y >= r.maxY) {
    r.y = r.maxY;
    r.vy = -Math.abs(r.vy);
    r.angle = Math.atan2(-Math.abs(r.vy), r.vx);
  }
  if (Math.abs(r.vx) > 0.05) r.facingRight = r.vx > 0;

  return r;
}

// Advances the 2-frame walk cycle at a fixed rate (independent of the
// steering timers above) while walking; holds frame 0 while standing.
// fps matches roughly what looked right for the base seed states earlier
// in this project — adjust freely.
const WALK_FPS = 4;

export function stepAnim(r, dt) {
  if (r.state !== 'walk') {
    r.animFrame = 0;
    r.animTimer = 0;
    return r;
  }
  r.animTimer += dt;
  if (r.animTimer >= 1 / WALK_FPS) {
    r.animTimer = 0;
    r.animFrame = r.animFrame === 0 ? 1 : 0;
  }
  return r;
}

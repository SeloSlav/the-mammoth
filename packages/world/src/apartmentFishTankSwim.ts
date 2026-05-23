/**
 * Local-space aquarium bounds matching `apps/client/public/static/models/objects/fish-tank.glb`
 * interior water volume (`scripts/fix-fish-tank-glb.mjs` glass shell), shrunk so fish meshes
 * stay visibly inside glass.
 */

export type FishTankSwimAabb = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

/** Meters-ish in authored GLB local space under the decor visual root. */
export const FISH_TANK_SWIM_AABB: FishTankSwimAabb = {
  minX: -0.76,
  maxX: 0.76,
  minY: -0.35,
  maxY: 0.42,
  minZ: -0.34,
  maxZ: 0.34,
};

export type FishTankSwimFishState = {
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds until heading retarget */
  steerT: number;
  tx: number;
  ty: number;
  tz: number;
};

const MAX_SPEED_DEFAULT = 0.055;

/**
 * Tiny deterministic RNG (mulberry32) — cheap, no allocations, reproducible wander per fishery.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0 || 4294967291;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export function fnv1a32(input: string): number {
  let h = 0x811c_9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x0100_0193);
    h >>>= 0;
  }
  return h >>> 0;
}

function clampAxis(
  px: number,
  vx: number,
  lo: number,
  hi: number,
  friction: number,
): { px: number; vx: number } {
  if (px < lo) return { px: lo, vx: Math.abs(vx) * friction + 0.006 };
  if (px > hi) return { px: hi, vx: -Math.abs(vx) * friction - 0.006 };
  return { px, vx };
}

/**
 * Velocity random walk toward periodically resampled wander targets — lazy, continuous motion.
 */
export function stepFishTankFish(
  fish: FishTankSwimFishState,
  dtSafe: number,
  aabb: FishTankSwimAabb,
  rng: () => number,
  opts?: { maxSpeed?: number },
): void {
  const maxSpeed = opts?.maxSpeed ?? MAX_SPEED_DEFAULT;
  fish.steerT -= dtSafe;
  if (fish.steerT <= 0) {
    fish.steerT = 1.6 + rng() * 5.2;
    fish.tx = (rng() * 2 - 1) * maxSpeed;
    fish.tz = (rng() * 2 - 1) * maxSpeed;
    fish.ty = (rng() * 2 - 1) * maxSpeed * 0.52;
  }

  const converge = 1 - Math.exp(-1.42 * dtSafe);
  fish.vx += (fish.tx - fish.vx) * converge;
  fish.vy += (fish.ty - fish.vy) * converge;
  fish.vz += (fish.tz - fish.vz) * converge;

  let sp = Math.hypot(fish.vx, fish.vy, fish.vz);
  if (sp > maxSpeed && sp > 1e-10) {
    const f = maxSpeed / sp;
    fish.vx *= f;
    fish.vy *= f;
    fish.vz *= f;
    sp = maxSpeed;
  }

  fish.px += fish.vx * dtSafe;
  fish.py += fish.vy * dtSafe;
  fish.pz += fish.vz * dtSafe;

  const reflect = 0.28;

  let cx = clampAxis(fish.px, fish.vx, aabb.minX, aabb.maxX, reflect);
  fish.px = cx.px;
  fish.vx = cx.vx;
  const cy = clampAxis(fish.py, fish.vy, aabb.minY, aabb.maxY, reflect);
  fish.py = cy.px;
  fish.vy = cy.vx;
  const cz = clampAxis(fish.pz, fish.vz, aabb.minZ, aabb.maxZ, reflect);
  fish.pz = cz.px;
  fish.vz = cz.vx;
}

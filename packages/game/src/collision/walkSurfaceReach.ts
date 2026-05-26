import type { CollisionAabbLike } from "./combatSimArena.js";
import { FP_WALK_STEP_UP_MARGIN_M, STEP_IGNORE_BELOW_FEET_M } from "./fpCapsuleLocomotion.js";

/** Match `packages/engine` `FP_WALK_FOOT_RADIUS_XZ` / server codegen. */
export const FP_WALK_FOOT_RADIUS_XZ_M = 0.22;
/** Downward probe length (m) — feet Y = probeTopY − probeDy. */
export const FP_WALK_PROBE_DY_M = 1.05;
/** Max support drop below probe feet during descent (m). */
export const FP_WALK_MAX_SUPPORT_DROP_BELOW_FEET_M = 3.1;

export type WalkSurfaceReachOpts = {
  stepUpMarginM?: number;
  /** Airborne descent — accept tops up to probeTopY instead of feetY + stepUp. */
  descentProbe?: boolean;
  maxSupportDropBelowFeetM?: number;
};

/** Shared reach rule for walk AABB queries — keep client index + server combat sim aligned. */
export function walkSurfaceTopIsReachable(
  top: number,
  feetY: number,
  probeTopY: number,
  opts?: WalkSurfaceReachOpts,
): boolean {
  if (opts?.descentProbe) {
    const maxDrop = opts.maxSupportDropBelowFeetM ?? FP_WALK_MAX_SUPPORT_DROP_BELOW_FEET_M;
    return top <= probeTopY + 1e-3 && top >= feetY - maxDrop;
  }
  const stepUpMargin = opts?.stepUpMarginM ?? FP_WALK_STEP_UP_MARGIN_M;
  return top <= feetY + stepUpMargin;
}

export type SampleWalkTopFromSlabsOpts = WalkSurfaceReachOpts & {
  footRadiusXZ?: number;
};

/**
 * Highest walk surface under a foot rectangle at (x,z).
 * Returns NaN when no slab overlaps the foot (caller decides fallback).
 */
export function sampleWalkTopFromSlabs(
  slabs: readonly CollisionAabbLike[],
  x: number,
  z: number,
  probeFeetY: number,
  probeTopY: number,
  opts?: SampleWalkTopFromSlabsOpts,
): number {
  const footR = opts?.footRadiusXZ ?? FP_WALK_FOOT_RADIUS_XZ_M;
  const fx0 = x - footR;
  const fx1 = x + footR;
  const fz0 = z - footR;
  const fz1 = z + footR;
  let best = Number.NaN;
  for (const b of slabs) {
    if (fx1 < b.min[0] || fx0 > b.max[0] || fz1 < b.min[2] || fz0 > b.max[2]) continue;
    const top = b.max[1];
    if (walkSurfaceTopIsReachable(top, probeFeetY, probeTopY, opts)) {
      best = Number.isFinite(best) ? Math.max(best, top) : top;
    }
  }
  return best;
}

/** Grounded NPC / authority sampling — ignores surfaces far below feet. */
export function sampleGroundedWalkTopFromSlabs(
  slabs: readonly CollisionAabbLike[],
  x: number,
  z: number,
  probeFeetY: number,
  fallbackFeetY: number,
  opts?: SampleWalkTopFromSlabsOpts,
): number {
  const probeTopY = probeFeetY + FP_WALK_PROBE_DY_M;
  const top = sampleWalkTopFromSlabs(slabs, x, z, probeFeetY, probeTopY, opts);
  if (Number.isFinite(top)) return top;
  const stepIgnoreBelow = STEP_IGNORE_BELOW_FEET_M;
  for (const b of slabs) {
    if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue;
    const slabTop = b.max[1];
    if (
      slabTop <= probeFeetY + (opts?.stepUpMarginM ?? FP_WALK_STEP_UP_MARGIN_M) + 1e-4 &&
      slabTop >= probeFeetY - stepIgnoreBelow - 1e-4 &&
      slabTop > fallbackFeetY
    ) {
      fallbackFeetY = slabTop;
    }
  }
  return fallbackFeetY;
}

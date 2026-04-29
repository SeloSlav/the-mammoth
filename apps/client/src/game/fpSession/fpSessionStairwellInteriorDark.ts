import type { FpStairShaftInteriorLightBounds } from "./fpSessionWorldMount";

export function fpSampleStairwellInteriorDarkTarget(
  x: number,
  y: number,
  z: number,
  bounds: readonly FpStairShaftInteriorLightBounds[],
): number {
  for (const b of bounds) {
    if (
      x >= b.minX &&
      x <= b.maxX &&
      y >= b.minY &&
      y <= b.maxY &&
      z >= b.minZ &&
      z <= b.maxZ
    ) {
      return 1;
    }
  }
  return 0;
}

export function fpExpSmoothToward(
  current: number,
  target: number,
  dtSec: number,
  halfLifeSec: number,
): number {
  if (halfLifeSec <= 1e-6) return target;
  const a = 1 - Math.pow(0.5, dtSec / halfLifeSec);
  return current + (target - current) * a;
}

export const STAIRWELL_INTERIOR_DARK_HALF_LIFE_SEC = 0.22;

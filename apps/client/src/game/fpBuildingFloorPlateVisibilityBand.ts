/**
 * 1-based floor plate index band (`mammothPlateLevelIndex`) for toggling `buildingRoot` children.
 * When {@link revealFullStack} is true (e.g. inside an elevator hoistway), every storey stays
 * visible so shaft-adjacent shell geometry is not culled while looking up/down the shaft.
 */

/**
 * Only allow floor-band culling when the camera is clearly inside the building footprint.
 * Exterior or near-perimeter views keep the full stack visible so facade slices never pop.
 */
export function fpBuildingExteriorViewShouldRevealFullStack(input: {
  cameraX: number;
  cameraZ: number;
  boundsMinX: number;
  boundsMaxX: number;
  boundsMinZ: number;
  boundsMaxZ: number;
  interiorCullInsetM?: number;
}): boolean {
  const {
    cameraX,
    cameraZ,
    boundsMinX,
    boundsMaxX,
    boundsMinZ,
    boundsMaxZ,
  } = input;
  const inset = Math.max(0, input.interiorCullInsetM ?? 6);
  const innerMinX = boundsMinX + inset;
  const innerMaxX = boundsMaxX - inset;
  const innerMinZ = boundsMinZ + inset;
  const innerMaxZ = boundsMaxZ - inset;
  if (innerMinX > innerMaxX || innerMinZ > innerMaxZ) {
    return true;
  }
  return !(
    cameraX >= innerMinX &&
    cameraX <= innerMaxX &&
    cameraZ >= innerMinZ &&
    cameraZ <= innerMaxZ
  );
}

export function fpBuildingFloorPlateVisibilityBand(input: {
  maxLevel: number;
  /** 1-based storey from feet Y (see {@link estimateStoreyFromFeetY}). */
  playerStorey: number;
  revealFullStack: boolean;
  /**
   * Highest storey the camera is actively looking toward; only widens the upper bound so exterior
   * facades above the player do not pop out while looking up from lower levels.
   */
  upperTargetStorey?: number;
}): { lo: number; hi: number } {
  const maxLevel = Math.max(1, input.maxLevel);
  if (input.revealFullStack) {
    return { lo: 1, hi: maxLevel };
  }
  /** Half-width (storeys) around the player — wider than ±1 avoids plate pop-in when moving fast. */
  const halfSpan = 4;
  let lo = input.playerStorey - halfSpan;
  let hi = input.playerStorey + halfSpan;
  if (typeof input.upperTargetStorey === "number" && Number.isFinite(input.upperTargetStorey)) {
    hi = Math.max(hi, Math.ceil(input.upperTargetStorey) + 2);
  }
  lo = Math.max(1, Math.min(maxLevel, lo));
  hi = Math.max(1, Math.min(maxLevel, hi));
  if (lo > hi) [lo, hi] = [hi, lo];
  return { lo, hi };
}

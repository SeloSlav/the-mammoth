/**
 * 1-based floor plate index band (`mammothPlateLevelIndex`) for toggling `buildingRoot` children.
 * When {@link revealFullStack} is true (e.g. inside an elevator hoistway), every storey stays
 * visible so shaft-adjacent shell geometry is not culled while looking up/down the shaft.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * When the camera is outside the building footprint, keep the shell visible either when the
 * tower is nearby in peripheral vision or when the player is actively facing back toward it.
 */
export function fpBuildingExteriorViewShouldRevealFullStack(input: {
  cameraX: number;
  cameraZ: number;
  viewDirX: number;
  viewDirZ: number;
  boundsMinX: number;
  boundsMaxX: number;
  boundsMinZ: number;
  boundsMaxZ: number;
  nearRevealDistanceM?: number;
  minFacingDot?: number;
}): boolean {
  const {
    cameraX,
    cameraZ,
    viewDirX,
    viewDirZ,
    boundsMinX,
    boundsMaxX,
    boundsMinZ,
    boundsMaxZ,
  } = input;
  if (
    cameraX >= boundsMinX &&
    cameraX <= boundsMaxX &&
    cameraZ >= boundsMinZ &&
    cameraZ <= boundsMaxZ
  ) {
    return false;
  }
  const targetX = clamp(cameraX, boundsMinX, boundsMaxX);
  const targetZ = clamp(cameraZ, boundsMinZ, boundsMaxZ);
  const toBuildingX = targetX - cameraX;
  const toBuildingZ = targetZ - cameraZ;
  const toBuildingLen = Math.hypot(toBuildingX, toBuildingZ);
  if (toBuildingLen <= (input.nearRevealDistanceM ?? 14)) {
    return true;
  }
  const viewLen = Math.hypot(viewDirX, viewDirZ);
  if (toBuildingLen <= 1e-5 || viewLen <= 1e-5) {
    return false;
  }
  const facingDot =
    (viewDirX * toBuildingX + viewDirZ * toBuildingZ) / (viewLen * toBuildingLen);
  return facingDot >= (input.minFacingDot ?? 0.2);
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

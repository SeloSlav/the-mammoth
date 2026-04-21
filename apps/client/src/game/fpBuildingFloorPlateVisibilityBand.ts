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

/**
 * True when camera **or** feet lie inside the building’s **raw** world XZ AABB (optional epsilon).
 * Stricter than {@link fpCameraOrFeetNearBuildingFootprintXZ} (that helper adds `nearMarginM`).
 */
export function fpCameraOrFeetInsideBuildingFootprintXZ(input: {
  cameraX: number;
  cameraZ: number;
  feetX: number;
  feetZ: number;
  boundsMinX: number;
  boundsMaxX: number;
  boundsMinZ: number;
  boundsMaxZ: number;
  /** Expand the footprint slightly so boundary grazing does not flicker. */
  epsilonM?: number;
}): boolean {
  const eps = Math.max(0, input.epsilonM ?? 0.05);
  const minX = input.boundsMinX - eps;
  const maxX = input.boundsMaxX + eps;
  const minZ = input.boundsMinZ - eps;
  const maxZ = input.boundsMaxZ + eps;
  const xzIn = (x: number, z: number) =>
    x >= minX && x <= maxX && z >= minZ && z <= maxZ;
  return (
    xzIn(input.cameraX, input.cameraZ) || xzIn(input.feetX, input.feetZ)
  );
}

/**
 * True when camera **or** feet lie inside the world XZ slab expanded **outward** by `nearMarginM`
 * on each side (plus `epsilonM`). Used to rasterise `mammothUnitInterior` shells only when the
 * player could plausibly see them (inside, perimeter, or peeking from a sidewalk), while keeping
 * them off on distant exterior shots for fill-rate.
 */
export function fpCameraOrFeetNearBuildingFootprintXZ(input: {
  cameraX: number;
  cameraZ: number;
  feetX: number;
  feetZ: number;
  boundsMinX: number;
  boundsMaxX: number;
  boundsMinZ: number;
  boundsMaxZ: number;
  /**
   * Meters past the raw footprint edge on −X/+X/−Z/+Z. Default tuned for lobby doors slightly
   * outside the merged mesh AABB and head lean through glass.
   */
  nearMarginM?: number;
  /** Expand the near box slightly so grazing the margin does not flicker. */
  epsilonM?: number;
}): boolean {
  const margin = Math.max(0, input.nearMarginM ?? 10);
  const eps = Math.max(0, input.epsilonM ?? 0.05);
  const minX = input.boundsMinX - margin - eps;
  const maxX = input.boundsMaxX + margin + eps;
  const minZ = input.boundsMinZ - margin - eps;
  const maxZ = input.boundsMaxZ + margin + eps;
  const xzIn = (x: number, z: number) =>
    x >= minX && x <= maxX && z >= minZ && z <= maxZ;
  return (
    xzIn(input.cameraX, input.cameraZ) || xzIn(input.feetX, input.feetZ)
  );
}

/** Storeys above/below the player to keep visible when not in shaft / cab (interior band). */
const INTERIOR_PLATE_BAND_HALF_SPAN = 2;

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
  /**
   * Lowest storey the camera is looking toward when pitching down (stairs, atrium); widens the lower
   * bound symmetrically to {@link upperTargetStorey}.
   */
  lowerTargetStorey?: number;
}): { lo: number; hi: number } {
  const maxLevel = Math.max(1, input.maxLevel);
  if (input.revealFullStack) {
    return { lo: 1, hi: maxLevel };
  }
  /**
   * Cap half-width for tall buildings so `syncBuildingFloorPlateVisibility` turns off distant
   * plates — merged shells + preserved unit interiors otherwise stay in the scene graph every frame
   * (frustum tests are weak for full-floor bounding volumes when sightlines are horizontal along a
   * corridor). Small stacks still get `halfSpan >= maxLevel - 1` via the inner `min` so short
   * towers stay fully banded.
   */
  const halfSpan = Math.min(
    INTERIOR_PLATE_BAND_HALF_SPAN,
    Math.max(4, maxLevel - 1),
  );
  let lo = input.playerStorey - halfSpan;
  let hi = input.playerStorey + halfSpan;
  if (typeof input.upperTargetStorey === "number" && Number.isFinite(input.upperTargetStorey)) {
    hi = Math.max(hi, Math.ceil(input.upperTargetStorey) + 2);
  }
  if (typeof input.lowerTargetStorey === "number" && Number.isFinite(input.lowerTargetStorey)) {
    lo = Math.min(lo, Math.floor(input.lowerTargetStorey) - 2);
  }
  lo = Math.max(1, Math.min(maxLevel, lo));
  hi = Math.max(1, Math.min(maxLevel, hi));
  if (lo > hi) [lo, hi] = [hi, lo];
  return { lo, hi };
}

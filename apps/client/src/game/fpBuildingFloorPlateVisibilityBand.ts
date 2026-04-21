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
 * Whether apartment unit interior shell meshes (plaster `shell_wall_*`) should draw.
 *
 * {@link fpBuildingExteriorViewShouldRevealFullStack} intentionally uses a **6 m inset** so
 * floor-plate culling stays conservative near façades. That same “perimeter = exterior” rule must
 * **not** drive interior visibility: shallow perimeter units sit entirely in that outer ring, so
 * reusing the inset test makes plaster walls vanish when you approach a window.
 *
 * Use the building’s **raw** world XZ AABB instead (camera **or** feet — whichever still reads as
 * inside the footprint). Hide only when both samples are clearly outside the slab outline.
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
  /**
   * Half-width (storeys) around the player. Use at least `maxLevel - 1` so every plate stays visible
   * from any storey (wide footprints otherwise keep the camera “interior” in XZ while tall
   * façades / top-level shells were culled).
   */
  const halfSpan = Math.max(4, maxLevel - 1);
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

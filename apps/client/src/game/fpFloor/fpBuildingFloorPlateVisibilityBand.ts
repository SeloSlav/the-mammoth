/**
 * 1-based floor plate index band (`mammothPlateLevelIndex`) for toggling `buildingRoot` children.
 *
 * `revealFullStack: true` is tests / legacy only (every storey on). Runtime FP uses `elevatorHoistwayPlateBoost`
 * for open hoistways so shaft-adjacent shells stay visible without submitting the entire merged stack.
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
 * True only when the camera lies inside the building's raw world XZ AABB.
 * Use this for interior props that must not be visible from outside glass.
 */
export function fpCameraInsideBuildingFootprintXZ(input: {
  cameraX: number;
  cameraZ: number;
  boundsMinX: number;
  boundsMaxX: number;
  boundsMinZ: number;
  boundsMaxZ: number;
  /** Expand the footprint slightly so boundary grazing does not flicker. */
  epsilonM?: number;
}): boolean {
  return fpCameraOrFeetInsideBuildingFootprintXZ({
    cameraX: input.cameraX,
    cameraZ: input.cameraZ,
    feetX: input.cameraX,
    feetZ: input.cameraZ,
    boundsMinX: input.boundsMinX,
    boundsMaxX: input.boundsMaxX,
    boundsMinZ: input.boundsMinZ,
    boundsMaxZ: input.boundsMaxZ,
    epsilonM: input.epsilonM,
  });
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

/** Storeys above/below the player to keep visible in ordinary interior corridors. */
const INTERIOR_PLATE_BAND_HALF_SPAN = 0;

/**
 * Pitch lookahead widens the global plate band many storeys upward; stair flight meshes stack in the
 * same band and become fill-rate bound when peeking up a shaft. Stair columns (`mammothStairColumnRoot`)
 * get a tighter cap so you still see a tall vertical run without submitting every flight to the GPU.
 * Skipped when the global band already spans the full building (elevator hoistway / exterior stack).
 */
const STAIR_COLUMN_PLATE_BAND_MAX_STOREYS_ABOVE_PLAYER = 14;
const STAIR_COLUMN_PLATE_BAND_MAX_STOREYS_BELOW_PLAYER = 5;

/** Looking up/down inside a stair shaft must not submit the whole tower. */
const STAIR_SHAFT_LOCAL_PLATE_BAND_MAX_STOREYS_ABOVE_PLAYER = 4;
const STAIR_SHAFT_LOCAL_PLATE_BAND_MAX_STOREYS_BELOW_PLAYER = 2;

/**
 * Inside the hoistway column: **current storey only** for floor plates / neighbor glass.
 * Pitch lookahead is suppressed separately in {@link fpElevatorFloorVisAndCabContext}; landing
 * doors + hail still use {@link FP_FLOOR_VIS_BAND_PAD_STOREYS} on the smoothed band.
 */
export const HOISTWAY_PLATE_MAX_STOREYS_ABOVE_PLAYER = 0;
export const HOISTWAY_PLATE_MAX_STOREYS_BELOW_PLAYER = 0;

/** Single-storey band while feet/eye are in the hoistway column (not cab, not true exterior). */
export function fpHoistwayColumnPlateBand(input: {
  playerStorey: number;
  maxLevel: number;
}): { lo: number; hi: number } {
  const s = Math.max(1, Math.min(input.maxLevel, input.playerStorey));
  return { lo: s, hi: s };
}

export function fpStairColumnPlateVisibilityBand(input: {
  globalLo: number;
  globalHi: number;
  maxLevel: number;
  playerStorey: number;
}): { lo: number; hi: number } {
  const maxLevel = Math.max(1, input.maxLevel);
  const gLo = input.globalLo;
  const gHi = input.globalHi;
  if (gLo <= 1 && gHi >= maxLevel) {
    return { lo: gLo, hi: gHi };
  }
  const capLo =
    input.playerStorey - STAIR_COLUMN_PLATE_BAND_MAX_STOREYS_BELOW_PLAYER;
  const capHi =
    input.playerStorey + STAIR_COLUMN_PLATE_BAND_MAX_STOREYS_ABOVE_PLAYER;
  let lo = Math.max(gLo, capLo);
  let hi = Math.min(gHi, capHi);
  lo = Math.max(1, Math.min(maxLevel, lo));
  hi = Math.max(1, Math.min(maxLevel, hi));
  if (lo > hi) [lo, hi] = [hi, lo];
  return { lo, hi };
}

export function fpStairShaftLocalVisibilityBand(input: {
  globalLo: number;
  globalHi: number;
  maxLevel: number;
  playerStorey: number;
}): { lo: number; hi: number } {
  const maxLevel = Math.max(1, input.maxLevel);
  const playerStorey = Math.max(1, Math.min(maxLevel, input.playerStorey));
  const localLo = Math.max(
    1,
    playerStorey - STAIR_SHAFT_LOCAL_PLATE_BAND_MAX_STOREYS_BELOW_PLAYER,
  );
  const localHi = Math.min(
    maxLevel,
    playerStorey + STAIR_SHAFT_LOCAL_PLATE_BAND_MAX_STOREYS_ABOVE_PLAYER,
  );
  return { lo: localLo, hi: localHi };
}

export function fpBuildingFloorPlateVisibilityBand(input: {
  maxLevel: number;
  /** 1-based storey from feet Y (see {@link estimateStoreyFromFeetY}). */
  playerStorey: number;
  revealFullStack: boolean;
  /**
   * Open hoistway, eye/feet in shaft column (not inside cab volume): widen vertical plate budget vs
   * interior-only caps, without enabling {@link revealFullStack}.
   */
  elevatorHoistwayPlateBoost?: boolean;
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
  const halfSpan = Math.min(INTERIOR_PLATE_BAND_HALF_SPAN, maxLevel - 1);
  let lo = input.playerStorey - halfSpan;
  let hi = input.playerStorey + halfSpan;
  if (typeof input.upperTargetStorey === "number" && Number.isFinite(input.upperTargetStorey)) {
    hi = Math.max(hi, Math.ceil(input.upperTargetStorey) + 2);
  }
  if (typeof input.lowerTargetStorey === "number" && Number.isFinite(input.lowerTargetStorey)) {
    lo = Math.min(lo, Math.floor(input.lowerTargetStorey) - 2);
  }
  /**
   * Pitch lookahead can push the global band many storeys upward/downward. Keep ordinary interior
   * views on a tight local budget so looking at your feet from a perimeter apartment does not
   * submit the whole tower below; hoistway views still get the wider landing-context budget.
   */
  const maxAbove =
    input.elevatorHoistwayPlateBoost === true
      ? HOISTWAY_PLATE_MAX_STOREYS_ABOVE_PLAYER
      : STAIR_COLUMN_PLATE_BAND_MAX_STOREYS_ABOVE_PLAYER;
  const maxBelow =
    input.elevatorHoistwayPlateBoost === true
      ? HOISTWAY_PLATE_MAX_STOREYS_BELOW_PLAYER
      : STAIR_COLUMN_PLATE_BAND_MAX_STOREYS_BELOW_PLAYER;
  hi = Math.min(hi, input.playerStorey + maxAbove);
  lo = Math.max(lo, input.playerStorey - maxBelow);
  lo = Math.max(1, Math.min(maxLevel, lo));
  hi = Math.max(1, Math.min(maxLevel, hi));
  if (lo > hi) [lo, hi] = [hi, lo];
  return { lo, hi };
}

/**
 * Discrete vertical band index for pickups / occlusion — shares the same −0.25 m pad band as
 * {@link estimateStoreyFromFeetY} (`floor((worldY − originY − pad) / spacing)`).
 *
 * Feet sit ~eye height above slab while anchored drops land ~`WORLD_LOOT_Y_OFFSET`; comparing raw |Δy|
 * to a storey fraction fails across stacked plates. Matching bands rejects other storeys cleanly.
 */
export function mammothVerticalStoryBandIndex(
  worldY: number,
  buildingOriginY: number,
  floorSpacingM: number,
): number {
  const spacing = Math.max(1e-4, floorSpacingM);
  return Math.floor((worldY - buildingOriginY - 0.25) / spacing);
}

/**
 * 1-based storey index from feet Y and building vertical layout.
 * Matches FP elevator / visibility conventions (story 1 = lowest plate).
 */
export function estimateStoreyFromFeetY(
  feetY: number,
  opts: {
    buildingWorldOriginY: number;
    floorSpacingM: number;
    maxLevel: number;
  },
): number {
  const { buildingWorldOriginY: oy, floorSpacingM, maxLevel } = opts;
  const raw = 1 + Math.floor((feetY - oy - 0.25) / floorSpacingM);
  return Math.max(1, Math.min(maxLevel, raw));
}

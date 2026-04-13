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

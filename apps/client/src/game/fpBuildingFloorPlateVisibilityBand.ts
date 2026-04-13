/**
 * 1-based floor plate index band (`mammothPlateLevelIndex`) for toggling `buildingRoot` children.
 * When {@link revealFullStack} is true (e.g. inside an elevator hoistway), every storey stays
 * visible so shaft-adjacent shell geometry is not culled while looking up/down the shaft.
 */
export function fpBuildingFloorPlateVisibilityBand(input: {
  maxLevel: number;
  /** 1-based storey from feet Y (see {@link estimateStoreyFromFeetY}). */
  playerStorey: number;
  revealFullStack: boolean;
}): { lo: number; hi: number } {
  const maxLevel = Math.max(1, input.maxLevel);
  if (input.revealFullStack) {
    return { lo: 1, hi: maxLevel };
  }
  /** Half-width (storeys) around the player — wider than ±1 avoids plate pop-in when moving fast. */
  const halfSpan = 4;
  let lo = input.playerStorey - halfSpan;
  let hi = input.playerStorey + halfSpan;
  lo = Math.max(1, Math.min(maxLevel, lo));
  hi = Math.max(1, Math.min(maxLevel, hi));
  if (lo > hi) [lo, hi] = [hi, lo];
  return { lo, hi };
}

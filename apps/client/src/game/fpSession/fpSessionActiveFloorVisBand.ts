/** Neighbor storeys for door animation + elevator landing work. */
export const FP_FLOOR_VIS_BAND_PAD_STOREYS = 1;

/** Beyond this XZ distance from a hoistway, skip heavy per-landing elevator tick work. */
export const FP_ELEVATOR_SHAFT_SLEEP_XZ_M = 42;

export type FpActiveFloorPlateBand = { lo: number; hi: number };

export function isLevelInActiveFloorVisBand(
  level: number,
  band: FpActiveFloorPlateBand,
  padStoreys: number = FP_FLOOR_VIS_BAND_PAD_STOREYS,
): boolean {
  return level >= band.lo - padStoreys && level <= band.hi + padStoreys;
}

export function shouldRunElevatorShaftHeavyTick(input: {
  distXZ: number;
  insideCab: boolean;
}): boolean {
  if (input.insideCab) return true;
  return input.distXZ <= FP_ELEVATOR_SHAFT_SLEEP_XZ_M;
}

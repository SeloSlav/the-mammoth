import type { ElevatorShaftLayout } from "./elevatorShaftLayout.js";
import { elevatorCabGameplayHalfExtentsM, elevatorSupportFeetWorldY } from "./elevatorShaftLayout.js";

/** Matches server `elevator::call_center_y` (`support_y(level) + 1.1`). */
export const ELEVATOR_LANDING_CALL_CENTER_Y_OFFSET_M = 1.1;

const DEFAULT_OUTWARD_PAD_M = 0.52;

type ShaftGeom = Pick<ElevatorShaftLayout, "doorFace" | "plateLocalY" | "sy" | "sx" | "sz">;

function callPadWorldXZ(
  plateWorldX: number,
  plateWorldZ: number,
  shaft: ShaftGeom,
  outwardPadM: number,
): { cx: number; cz: number } {
  const n =
    shaft.doorFace === "e"
      ? ([1, 0] as const)
      : shaft.doorFace === "w"
        ? ([-1, 0] as const)
        : shaft.doorFace === "n"
          ? ([0, 1] as const)
          : ([0, -1] as const);
  const { halfX, halfZ } = elevatorCabGameplayHalfExtentsM(shaft.sx, shaft.sz);
  const outward = shaft.doorFace === "e" || shaft.doorFace === "w" ? halfX : halfZ;
  return {
    cx: plateWorldX + n[0] * (outward + outwardPadM),
    cz: plateWorldZ + n[1] * (outward + outwardPadM),
  };
}

function callCenterWorldY(
  levelIndex: number,
  opts: {
    buildingWorldOriginY: number;
    floorSpacingM: number;
    shaft: ShaftGeom;
  },
): number {
  return (
    elevatorSupportFeetWorldY({
      buildingWorldOriginY: opts.buildingWorldOriginY,
      levelIndex,
      floorSpacingM: opts.floorSpacingM,
      shaftPlateLocalY: opts.shaft.plateLocalY,
      shaftSy: opts.shaft.sy,
    }) + ELEVATOR_LANDING_CALL_CENTER_Y_OFFSET_M
  );
}

/**
 * 1-based landing level the player is in front of for this hoistway, or `null` if not in the
 * landing-call volume. When vertical bands for two levels overlap (wide Y window), picks the
 * level whose `call_center_y` is closest to the player — fixes storey labels vs
 * {@link estimateStoreyFromFeetY} drift.
 *
 * Matches server `near_call_pose` geometry (see `apps/server/src/elevator/mod.rs`).
 */
export function resolveLandingHailLevel(
  px: number,
  py: number,
  pz: number,
  opts: {
    buildingWorldOriginY: number;
    floorSpacingM: number;
    maxLevel: number;
    plateWorldX: number;
    plateWorldZ: number;
    shaft: ShaftGeom;
    callRadiusXZ: number;
    callYHalfWindow: number;
    outwardPadM?: number;
  },
): number | null {
  const outwardPadM = opts.outwardPadM ?? DEFAULT_OUTWARD_PAD_M;
  const { cx, cz } = callPadWorldXZ(opts.plateWorldX, opts.plateWorldZ, opts.shaft, outwardPadM);
  if (Math.hypot(px - cx, pz - cz) > opts.callRadiusXZ) return null;

  let bestLevel: number | null = null;
  let bestDy = Infinity;
  for (let level = 1; level <= opts.maxLevel; level++) {
    const cyy = callCenterWorldY(level, opts);
    const dy = Math.abs(py - cyy);
    if (dy > opts.callYHalfWindow) continue;
    if (dy < bestDy) {
      bestDy = dy;
      bestLevel = level;
    }
  }
  return bestLevel;
}

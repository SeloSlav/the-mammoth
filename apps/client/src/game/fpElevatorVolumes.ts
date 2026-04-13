import type { ElevatorShaftLayout } from "@the-mammoth/world";
import { elevatorHoistwayInnerHalfExtents } from "@the-mammoth/world";
import type { ElevatorDoorFace } from "./fpElevatorLabels.js";
import {
  DOOR_W,
  ELEV_FLOOR_PICK_DOORWAY_RAY_MIN_OPEN,
  ELEV_FLOOR_PICK_DOORWAY_VIS_MIN_OPEN,
} from "./fpElevatorConstants.js";

export type FpElevatorInnerExtents = { halfX: number; halfZ: number; innerH: number };

/**
 * True when feet sit in this hoistway’s stacked world XZ column (authoritative plate X/Z from
 * {@link ElevatorShaftLayout}) and within a conservative building Y band.
 *
 * Floor-plate culling uses this so every storey stays visible while you look up the open shaft:
 * upper slabs only exist on other plates, and the in-car HUD box is intentionally tighter than
 * the hoistway interior.
 */
export function fpElevFeetInHoistwayColumnForFloorStack(
  px: number,
  py: number,
  pz: number,
  opts: {
    buildingWorldOriginX: number;
    buildingWorldOriginY: number;
    buildingWorldOriginZ: number;
    floorSpacingM: number;
    maxLevel: number;
    layout: Pick<ElevatorShaftLayout, "plateX" | "plateZ" | "sx" | "sz">;
  },
): boolean {
  const { halfX, halfZ } = elevatorHoistwayInnerHalfExtents(opts.layout.sx, opts.layout.sz);
  const wx = opts.buildingWorldOriginX + opts.layout.plateX;
  const wz = opts.buildingWorldOriginZ + opts.layout.plateZ;
  const lx = px - wx;
  const lz = pz - wz;
  const pad = 1.03;
  if (Math.abs(lx) > halfX * pad || Math.abs(lz) > halfZ * pad) return false;
  const oy = opts.buildingWorldOriginY;
  const yLo = oy - 6;
  const yHi = oy + opts.maxLevel * opts.floorSpacingM + 12;
  return py >= yLo && py <= yHi;
}

/**
 * Plate-local feet test for HUD “inside car” (slightly looser than server clamp).
 * Exported for unit tests.
 */
export function fpElevatorHudCarContainsLocalPoint(
  lx: number,
  lz: number,
  py: number,
  cabFeetY: number,
  inner: FpElevatorInnerExtents,
): boolean {
  if (Math.abs(lx) > inner.halfX * 0.97 || Math.abs(lz) > inner.halfZ * 0.97) return false;
  if (py < cabFeetY - 0.22 || py > cabFeetY + inner.innerH + 0.38) return false;
  return true;
}

/**
 * Plate-local XZ: player in the doorway / landing lip can see the in-car floor panel through the opening.
 * Exported for unit tests (must stay aligned with `tryRaycastFloorPick` / panel visibility).
 */
export function fpElevCarPanelDoorwayViewLocal(
  face: ElevatorDoorFace,
  lx: number,
  lz: number,
  py: number,
  cabFeetY: number,
  inner: FpElevatorInnerExtents,
): boolean {
  const { halfX: hx, halfZ: hz, innerH } = inner;
  if (py < cabFeetY - 0.22 || py > cabFeetY + innerH + 0.38) return false;
  const lipIn = 0.38;
  /** How far past the sill (into the hallway) we still show / raycast the in-car floor panel. */
  const lipOut = 5.25;
  const doorHalf = DOOR_W * 0.5 + 0.35;
  if (face === "e") {
    return lx > hx - lipIn && lx < hx + lipOut && Math.abs(lz) < doorHalf;
  }
  if (face === "w") {
    return lx < -hx + lipIn && lx > -hx - lipOut && Math.abs(lz) < doorHalf;
  }
  if (face === "n") {
    return lz > hz - lipIn && lz < hz + lipOut && Math.abs(lx) < doorHalf;
  }
  return lz < -hz + lipIn && lz > -hz - lipOut && Math.abs(lx) < doorHalf;
}

/** Floor-button meshes: always on in cab; from landing only when doors are open enough. */
export function fpElevFloorPickMeshesShouldShow(
  insideCarHud: boolean,
  doorwayPanelView: boolean,
  doorOpen01: number,
): boolean {
  if (insideCarHud) return true;
  return doorwayPanelView && doorOpen01 > ELEV_FLOOR_PICK_DOORWAY_VIS_MIN_OPEN;
}

/** Crosshair pick: in cab anytime; from landing only with door clearance. */
export function fpElevFloorPickRaycastShouldProceed(
  inCab: boolean,
  inDoorway: boolean,
  doorOpen01: number,
): boolean {
  if (!inCab && !inDoorway) return false;
  if (!inCab && doorOpen01 < ELEV_FLOOR_PICK_DOORWAY_RAY_MIN_OPEN) return false;
  return true;
}

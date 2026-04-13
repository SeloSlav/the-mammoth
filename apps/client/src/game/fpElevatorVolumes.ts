import type { ElevatorShaftLayout } from "@the-mammoth/world";
import { elevatorHoistwayInnerHalfExtents } from "@the-mammoth/world";
import type { ElevatorDoorFace } from "./fpElevatorLabels.js";
import {
  DOOR_W,
  ELEV_FLOOR_PICK_DOORWAY_RAY_MIN_OPEN,
  ELEV_FLOOR_PICK_DOORWAY_VIS_MIN_OPEN,
  ELEVATOR_CLAMP_DOOR_AXIS_INNER_FRAC,
  ELEVATOR_CLAMP_DOOR_SLACK_FULL_M,
  ELEVATOR_CLAMP_DOOR_SLACK_FULL_OPEN,
  ELEVATOR_CLAMP_DOOR_SLACK_START,
  ELEVATOR_CLAMP_NON_DOOR_FRAC,
  ELEVATOR_RIDER_SNAP_FEET_BELOW_CAB_M,
  ELEVATOR_RIDER_SNAP_HEADROOM_ABOVE_CAB_TOP_M,
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
 * Loose plate-local volume for post-locomotion rider foot snap (same XZ as HUD, relaxed vertical).
 * Tight HUD bounds would miss valid frames while the cab moves, so the player loses merge + snap and falls.
 */
export function fpElevatorRiderSnapContainsLocalPoint(
  lx: number,
  lz: number,
  py: number,
  cabFeetY: number,
  inner: FpElevatorInnerExtents,
): boolean {
  if (Math.abs(lx) > inner.halfX * 0.97 || Math.abs(lz) > inner.halfZ * 0.97) return false;
  const yLo = cabFeetY - ELEVATOR_RIDER_SNAP_FEET_BELOW_CAB_M;
  const yHi = cabFeetY + inner.innerH + ELEVATOR_RIDER_SNAP_HEADROOM_ABOVE_CAB_TOP_M;
  return py >= yLo && py <= yHi;
}

/** Match server `door_side_slack_m` — extra meters past the inner sill on the door side. */
export function fpElevatorDoorSideSlackM(doorOpen01: number): number {
  const o = doorOpen01;
  if (o >= ELEVATOR_CLAMP_DOOR_SLACK_FULL_OPEN) return ELEVATOR_CLAMP_DOOR_SLACK_FULL_M;
  if (o > ELEVATOR_CLAMP_DOOR_SLACK_START) {
    return (
      ELEVATOR_CLAMP_DOOR_SLACK_FULL_M *
      ((o - ELEVATOR_CLAMP_DOOR_SLACK_START) /
        (ELEVATOR_CLAMP_DOOR_SLACK_FULL_OPEN - ELEVATOR_CLAMP_DOOR_SLACK_START))
    );
  }
  return 0;
}

/**
 * Hard XZ box when feet are in the rider envelope (same predicate as snap/merge vertical band).
 * Mirrors server `clamp_player_to_elevators`: tight back + sides, door side + slack when opening.
 */
export function fpElevatorClampWorldXZToCabIfRider(
  wx: number,
  wz: number,
  py: number,
  cabFeetY: number,
  plateWorldX: number,
  plateWorldZ: number,
  doorFace: ElevatorDoorFace,
  doorOpen01: number,
  inner: FpElevatorInnerExtents,
): { x: number; z: number; didClamp: boolean } {
  const lx = wx - plateWorldX;
  const lz = wz - plateWorldZ;
  if (!fpElevatorRiderSnapContainsLocalPoint(lx, lz, py, cabFeetY, inner)) {
    return { x: wx, z: wz, didClamp: false };
  }
  const ihx = inner.halfX;
  const ihz = inner.halfZ;
  const ext = fpElevatorDoorSideSlackM(doorOpen01);
  const nx = ELEVATOR_CLAMP_NON_DOOR_FRAC;
  const di = ELEVATOR_CLAMP_DOOR_AXIS_INNER_FRAC;
  const cx = plateWorldX;
  const cz = plateWorldZ;

  let xmin: number;
  let xmax: number;
  let zmin: number;
  let zmax: number;
  switch (doorFace) {
    case "e":
      xmin = cx - ihx * nx;
      xmax = cx + ihx * di + ext;
      zmin = cz - ihz * nx;
      zmax = cz + ihz * nx;
      break;
    case "w":
      xmin = cx - ihx * di - ext;
      xmax = cx + ihx * nx;
      zmin = cz - ihz * nx;
      zmax = cz + ihz * nx;
      break;
    case "n":
      xmin = cx - ihx * nx;
      xmax = cx + ihx * nx;
      zmin = cz - ihz * nx;
      zmax = cz + ihz * di + ext;
      break;
    case "s":
      xmin = cx - ihx * nx;
      xmax = cx + ihx * nx;
      zmin = cz - ihz * di - ext;
      zmax = cz + ihz * nx;
      break;
  }

  const x = Math.min(Math.max(wx, xmin), xmax);
  const z = Math.min(Math.max(wz, zmin), zmax);
  const didClamp = x !== wx || z !== wz;
  return { x, z, didClamp };
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

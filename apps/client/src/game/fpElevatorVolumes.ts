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
  ELEVATOR_CLAMP_FOOT_CLEARANCE_M,
  ELEVATOR_CAB_PHYS_GATE_PAD_M,
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
 * Plate-local AABB used for cab XZ clamp (and physics containment), in meters from hoistway plate center.
 * Must stay aligned with `apps/server/src/elevator.rs` `clamp_player_to_elevators`.
 */
export function fpElevatorPlateLocalClampBounds(
  doorFace: ElevatorDoorFace,
  doorOpen01: number,
  inner: FpElevatorInnerExtents,
): { lxMin: number; lxMax: number; lzMin: number; lzMax: number } {
  const ihx = inner.halfX;
  const ihz = inner.halfZ;
  const ext = fpElevatorDoorSideSlackM(doorOpen01);
  const di = ELEVATOR_CLAMP_DOOR_AXIS_INNER_FRAC;
  const fc = ELEVATOR_CLAMP_FOOT_CLEARANCE_M;
  const lxSpan = Math.max(1e-4, ihx - fc);
  const lzSpan = Math.max(1e-4, ihz - fc);
  const doorGivingSlack = ext > ELEVATOR_CLAMP_DOOR_SLACK_START + 1e-6;

  switch (doorFace) {
    case "e": {
      const doorCap = ihx * di + ext;
      const lxMax = doorGivingSlack ? doorCap : Math.min(doorCap, lxSpan);
      return { lxMin: -lxSpan, lxMax, lzMin: -lzSpan, lzMax: lzSpan };
    }
    case "w": {
      const doorCap = ihx * di + ext;
      const lxMin = doorGivingSlack ? -doorCap : Math.max(-doorCap, -lxSpan);
      return { lxMin, lxMax: lxSpan, lzMin: -lzSpan, lzMax: lzSpan };
    }
    case "n": {
      const doorCap = ihz * di + ext;
      const lzMax = doorGivingSlack ? doorCap : Math.min(doorCap, lzSpan);
      return { lxMin: -lxSpan, lxMax: lxSpan, lzMin: -lzSpan, lzMax };
    }
    case "s": {
      const doorCap = ihz * di + ext;
      const lzMin = doorGivingSlack ? -doorCap : Math.max(-doorCap, -lzSpan);
      return { lxMin: -lxSpan, lxMax: lxSpan, lzMin, lzMax: lzSpan };
    }
  }
}

/**
 * True when feet are in the cab **physics** volume: rider vertical band + door-aware clamp box
 * (NOT the old symmetric 0.97× slab — that missed the door-slack region so clamp/snap never armed).
 */
export function fpElevatorPlateLocalInCabPhysicsVolume(
  lx: number,
  lz: number,
  py: number,
  cabFeetY: number,
  doorFace: ElevatorDoorFace,
  doorOpen01: number,
  inner: FpElevatorInnerExtents,
): boolean {
  const yLo = cabFeetY - ELEVATOR_RIDER_SNAP_FEET_BELOW_CAB_M;
  const yHi = cabFeetY + inner.innerH + ELEVATOR_RIDER_SNAP_HEADROOM_ABOVE_CAB_TOP_M;
  if (py < yLo || py > yHi) return false;
  const b = fpElevatorPlateLocalClampBounds(doorFace, doorOpen01, inner);
  const pad = ELEVATOR_CAB_PHYS_GATE_PAD_M;
  return (
    lx >= b.lxMin - pad &&
    lx <= b.lxMax + pad &&
    lz >= b.lzMin - pad &&
    lz <= b.lzMax + pad
  );
}

/**
 * Rider foot snap / server `player_rider_snap_grip`: same predicate as {@link fpElevatorPlateLocalInCabPhysicsVolume}.
 */
export function fpElevatorRiderSnapContainsLocalPoint(
  lx: number,
  lz: number,
  py: number,
  cabFeetY: number,
  inner: FpElevatorInnerExtents,
  doorFace: ElevatorDoorFace,
  doorOpen01: number,
): boolean {
  return fpElevatorPlateLocalInCabPhysicsVolume(lx, lz, py, cabFeetY, doorFace, doorOpen01, inner);
}

/**
 * Hard XZ box when feet are in the cab physics volume (door-aware, matches server clamp).
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
  if (!fpElevatorPlateLocalInCabPhysicsVolume(lx, lz, py, cabFeetY, doorFace, doorOpen01, inner)) {
    return { x: wx, z: wz, didClamp: false };
  }
  const b = fpElevatorPlateLocalClampBounds(doorFace, doorOpen01, inner);
  const xmin = plateWorldX + b.lxMin;
  const xmax = plateWorldX + b.lxMax;
  const zmin = plateWorldZ + b.lzMin;
  const zmax = plateWorldZ + b.lzMax;

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

import type { ElevatorShaftLayout } from "@the-mammoth/world";
import {
  elevatorHoistwayInnerHalfExtents,
  LANDING_PASSAGE_DOCK_Y_TOL_M,
} from "@the-mammoth/world";
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
  ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN,
  ELEVATOR_RIDER_SNAP_FLOOR_ATTACH_MAX_FEET_Y_INSET_BELOW_INNER_TOP_M,
  ELEVATOR_RIDER_SNAP_GRIP_EXTRA_ABOVE_INNER_M,
  ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M,
  ELEV_WALK_MERGE_FEET_ON_LANDING_EXTRA_SLACK_M,
} from "./fpElevatorConstants.js";

export type FpElevatorInnerExtents = { halfX: number; halfZ: number; innerH: number };

/**
 * True when a **world-space** point (feet, camera, etc.) sits in this hoistway’s stacked XZ column
 * ({@link ElevatorShaftLayout} plate X/Z) and within a conservative building Y band.
 *
 * Floor-plate culling uses this so every storey stays visible while you look up the open shaft.
 * Probe with **camera XZ** as well as feet — eyes can sit inside the shaft while feet remain in
 * the hallway; feet-only tests culled upper plates and made the shaft walls “disappear”.
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
 * Plate-local “inside cab” for gameplay reducers — matches
 * `apps/server/src/elevator/mod.rs` `player_inside_cab` (XZ 0.9 of gameplay inner half, vertical band;
 * upper slack uses {@link ELEVATOR_RIDER_SNAP_GRIP_EXTRA_ABOVE_INNER_M} so story N+1 feet do not
 * read as inside a docked car at N).
 */
export function fpElevPlayerInsideCabAuthoritativePlateLocal(
  lx: number,
  lz: number,
  py: number,
  cabFeetY: number,
  inner: FpElevatorInnerExtents,
): boolean {
  const { halfX: hx, halfZ: hz, innerH: iy } = inner;
  if (Math.abs(lx) > hx * 0.9 || Math.abs(lz) > hz * 0.9) return false;
  if (
    py < cabFeetY - 0.2 ||
    py > cabFeetY + iy + ELEVATOR_RIDER_SNAP_GRIP_EXTRA_ABOVE_INNER_M
  ) {
    return false;
  }
  return true;
}

/**
 * Cab floor may participate in FP walk / kinematic merge only as a real support: rider inside the
 * cab volume, or the car is **docked** at a landing whose feet Y matches the probe (same rule as
 * server `cab_walk_merge_support_feet_allowed`).
 */
export function fpElevCabWalkMergeSupportFeetAllowed(opts: {
  plateLocalX: number;
  plateLocalZ: number;
  feetWorldY: number;
  cabFeetWorldY: number;
  inner: FpElevatorInnerExtents;
  maxLevel: number;
  feetYForLevel: (level: number) => number;
}): boolean {
  const { plateLocalX: lx, plateLocalZ: lz, feetWorldY, cabFeetWorldY, inner, maxLevel, feetYForLevel } =
    opts;
  if (fpElevPlayerInsideCabAuthoritativePlateLocal(lx, lz, feetWorldY, cabFeetWorldY, inner)) {
    return true;
  }
  const landTol = LANDING_PASSAGE_DOCK_Y_TOL_M + ELEV_WALK_MERGE_FEET_ON_LANDING_EXTRA_SLACK_M;
  for (let level = 1; level <= maxLevel; level++) {
    const fy = feetYForLevel(level);
    if (
      Math.abs(cabFeetWorldY - fy) <= LANDING_PASSAGE_DOCK_Y_TOL_M &&
      Math.abs(feetWorldY - fy) <= landTol
    ) {
      return true;
    }
  }
  return false;
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
 * Must stay aligned with `apps/server/src/elevator/mod.rs` `clamp_player_to_elevator_kinematic_support` / `cab_plate_local_clamp_bounds`.
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
 * True when feet are in the cab **physics** volume for rider snap / XZ clamp arming: a **tight**
 * upper vertical bound (walk merge is additionally gated by {@link fpElevCabWalkMergeSupportFeetAllowed})
 * plus the door-aware clamp box.
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
  const yLo = cabFeetY - ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M;
  const yHi =
    cabFeetY + inner.innerH - ELEVATOR_RIDER_SNAP_FLOOR_ATTACH_MAX_FEET_Y_INSET_BELOW_INNER_TOP_M;
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
 * Rider is in the **padded** physics volume but only past the hard AABB on the **door-outward**
 * face (not side walls / corners). There we must **not** XZ-clamp or the player can never cross
 * `hard + pad` in finite steps (one-way sill). Matches server `elevator::in_door_outward_pad_shell`.
 */
export function fpElevatorInDoorOutwardPadShellOnly(
  lx: number,
  lz: number,
  doorFace: ElevatorDoorFace,
  b: { lxMin: number; lxMax: number; lzMin: number; lzMax: number },
  pad: number,
): boolean {
  switch (doorFace) {
    case "e":
      return (
        lx > b.lxMax &&
        lx <= b.lxMax + pad &&
        lz >= b.lzMin &&
        lz <= b.lzMax
      );
    case "w":
      return (
        lx < b.lxMin &&
        lx >= b.lxMin - pad &&
        lz >= b.lzMin &&
        lz <= b.lzMax
      );
    case "n":
      return (
        lz > b.lzMax &&
        lz <= b.lzMax + pad &&
        lx >= b.lxMin &&
        lx <= b.lxMax
      );
    case "s":
      return (
        lz < b.lzMin &&
        lz >= b.lzMin - pad &&
        lx >= b.lxMin &&
        lx <= b.lxMax
      );
  }
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
  const pad = ELEVATOR_CAB_PHYS_GATE_PAD_M;
  const inHard = lx >= b.lxMin && lx <= b.lxMax && lz >= b.lzMin && lz <= b.lzMax;
  if (
    !inHard &&
    doorOpen01 >= ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN &&
    fpElevatorInDoorOutwardPadShellOnly(lx, lz, doorFace, b, pad)
  ) {
    return { x: wx, z: wz, didClamp: false };
  }
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

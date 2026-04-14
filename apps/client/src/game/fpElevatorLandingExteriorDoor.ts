import {
  CLOSED_CAB_OUTSIDE_SLAB_IN,
  CLOSED_CAB_OUTSIDE_SLAB_OUT,
  CLOSED_CAB_OUTSIDE_WIDTH_PAD,
  elevatorCabGameplayHalfExtentsM,
  EXTERIOR_COLLISION_L0,
  EXTERIOR_COLLISION_L1,
  EXTERIOR_COLLISION_LZ_PAD,
  EXTERIOR_DOOR_ANIM_SPEED,
  EXTERIOR_DOOR_COLLISION_OPEN_THRESH,
  EXTERIOR_DOOR_H_M,
  EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING,
  EXTERIOR_DOOR_W_M,
  EXTERIOR_INTERACT_L0,
  EXTERIOR_INTERACT_L1,
  EXTERIOR_INTERACT_LZ_PAD,
  EXTERIOR_INTERACT_WORLD_RADIUS_M,
  EXTERIOR_INTERACT_WORLD_Y_HALF_M,
  EXTERIOR_STRIP_Y0,
  EXTERIOR_STRIP_Y1,
  LANDING_FRONT_PASSAGE_HALF_W_M,
  LANDING_FRONT_WALL_PUSH_OUT,
  LANDING_FRONT_WALL_SLAB_IN,
  LANDING_FRONT_WALL_SLAB_OUT,
  LANDING_PASSAGE_DOCK_Y_TOL_M,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type { ElevatorDoorFace } from "./fpElevatorLabels.js";
import type { Vector3 } from "three";
import { ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN } from "./fpElevatorConstants.js";
import type { FpElevatorInnerExtents } from "./fpElevatorVolumes.js";
import { fpElevPlayerInsideCabAuthoritativePlateLocal } from "./fpElevatorVolumes.js";

export {
  CLOSED_CAB_OUTSIDE_SLAB_IN,
  CLOSED_CAB_OUTSIDE_SLAB_OUT,
  CLOSED_CAB_OUTSIDE_WIDTH_PAD,
  EXTERIOR_COLLISION_L0,
  EXTERIOR_COLLISION_L1,
  EXTERIOR_COLLISION_LZ_PAD,
  EXTERIOR_DOOR_ANIM_SPEED,
  EXTERIOR_DOOR_COLLISION_OPEN_THRESH,
  EXTERIOR_DOOR_H_M,
  EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING,
  EXTERIOR_DOOR_W_M,
  EXTERIOR_INTERACT_L0,
  EXTERIOR_INTERACT_L1,
  EXTERIOR_INTERACT_LZ_PAD,
  EXTERIOR_INTERACT_WORLD_RADIUS_M,
  EXTERIOR_INTERACT_WORLD_Y_HALF_M,
  EXTERIOR_STRIP_Y0,
  EXTERIOR_STRIP_Y1,
  LANDING_FRONT_PASSAGE_HALF_W_M,
  LANDING_FRONT_WALL_PUSH_OUT,
  LANDING_FRONT_WALL_SLAB_IN,
  LANDING_FRONT_WALL_SLAB_OUT,
  LANDING_PASSAGE_DOCK_Y_TOL_M,
};

/** True when the static "closed door" collision slab should affect the player. */
export function fpElevExteriorDoorSolidPlayerSlabActive(swingOpen01: number): boolean {
  return swingOpen01 <= EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING;
}

/**
 * Smooth client visuals toward replicated `swingOpen01` without restarting a spline every tick.
 * Caps step rate to match authoritative door animation speed.
 */
export function advanceExteriorDoorVisSwingTowardAuth(opts: {
  current: number;
  authoritative: number;
  dtSec: number;
  animSpeedPerSec: number;
}): number {
  const { current, authoritative, dtSec, animSpeedPerSec } = opts;
  const dt = Math.max(0, dtSec);
  const maxStep = Math.max(0, animSpeedPerSec * dt);
  const d = authoritative - current;
  if (Math.abs(d) <= 1e-6) return authoritative;
  if (Math.abs(d) <= maxStep) return authoritative;
  return current + Math.sign(d) * maxStep;
}

export function landingExteriorDoorRowKey(shaftKey: string, level: number): string {
  return `${shaftKey}|${level >>> 0}`;
}

function exteriorDoorCenterWorldXZ(
  doorFace: ElevatorDoorFace,
  plateWorldX: number,
  plateWorldZ: number,
  hx: number,
  hz: number,
  side: "outside" | "inside",
): { x: number; z: number } {
  const s = side === "outside" ? 1 : -1;
  switch (doorFace) {
    case "e":
      return { x: plateWorldX + hx + 0.18 * s, z: plateWorldZ };
    case "w":
      return { x: plateWorldX - hx - 0.18 * s, z: plateWorldZ };
    case "n":
      return { x: plateWorldX, z: plateWorldZ + hz + 0.18 * s };
    case "s":
      return { x: plateWorldX, z: plateWorldZ - hz - 0.18 * s };
  }
}

function faceLateralHalfM(
  doorFace: ElevatorDoorFace,
  hx: number,
  hz: number,
): number {
  return doorFace === "e" || doorFace === "w" ? hz : hx;
}

function exteriorPlateLocalInSlab(
  doorFace: ElevatorDoorFace,
  hx: number,
  hz: number,
  lx: number,
  lz: number,
  py: number,
  landingFeetWorldY: number,
  l0: number,
  l1: number,
  lateralHalfM: number,
): boolean {
  const y0 = landingFeetWorldY + EXTERIOR_STRIP_Y0;
  const y1 = landingFeetWorldY + EXTERIOR_STRIP_Y1;
  if (py < y0 || py > y1) return false;
  switch (doorFace) {
    case "e": {
      const lo = hx + l0;
      const hi = hx + l1;
      return lx >= lo && lx <= hi && Math.abs(lz) <= lateralHalfM;
    }
    case "w": {
      const lo = -hx - l1;
      const hi = -hx - l0;
      return lx >= lo && lx <= hi && Math.abs(lz) <= lateralHalfM;
    }
    case "n": {
      const lo = hz + l0;
      const hi = hz + l1;
      return lz >= lo && lz <= hi && Math.abs(lx) <= lateralHalfM;
    }
    case "s": {
      const lo = -hz - l1;
      const hi = -hz - l0;
      return lz >= lo && lz <= hi && Math.abs(lx) <= lateralHalfM;
    }
  }
}

/** E-toggle volume — must match server `exterior_interact_plate_local_ok`. */
export function fpElevLandingExteriorDoorInteractPlateLocal(
  doorFace: ElevatorDoorFace,
  hx: number,
  hz: number,
  lx: number,
  lz: number,
  py: number,
  landingFeetWorldY: number,
): boolean {
  return exteriorPlateLocalInSlab(
    doorFace,
    hx,
    hz,
    lx,
    lz,
    py,
    landingFeetWorldY,
    EXTERIOR_INTERACT_L0,
    EXTERIOR_INTERACT_L1,
    EXTERIOR_DOOR_W_M * 0.5 + EXTERIOR_INTERACT_LZ_PAD,
  );
}

/** Broad near-door interaction volume for prompt / E-toggle. */
export function fpElevLandingExteriorDoorNearWorldPose(
  doorFace: ElevatorDoorFace,
  plateWorldX: number,
  plateWorldZ: number,
  hx: number,
  hz: number,
  px: number,
  py: number,
  pz: number,
  landingFeetWorldY: number,
): boolean {
  const outside = exteriorDoorCenterWorldXZ(doorFace, plateWorldX, plateWorldZ, hx, hz, "outside");
  const inside = exteriorDoorCenterWorldXZ(doorFace, plateWorldX, plateWorldZ, hx, hz, "inside");
  const nearEither =
    Math.hypot(px - outside.x, pz - outside.z) <= EXTERIOR_INTERACT_WORLD_RADIUS_M ||
    Math.hypot(px - inside.x, pz - inside.z) <= EXTERIOR_INTERACT_WORLD_RADIUS_M;
  if (!nearEither) return false;
  const cy = landingFeetWorldY + 1.1;
  return Math.abs(py - cy) <= EXTERIOR_INTERACT_WORLD_Y_HALF_M;
}

/**
 * True when the player may toggle the corridor (landing exterior) door from inside the cab while
 * the car is docked at that landing. Matches server `in_cab_docked_at_landing_for_spec` /
 * `player_inside_cab`.
 */
export function fpElevLandingExteriorDoorInCabDockedInteract(opts: {
  plateWorldX: number;
  plateWorldZ: number;
  px: number;
  py: number;
  pz: number;
  landingFeetWorldY: number;
  cabFeetWorldY: number;
  inner: FpElevatorInnerExtents;
  phaseMoving: boolean;
  dockYTolM: number;
}): boolean {
  if (opts.phaseMoving) return false;
  if (Math.abs(opts.cabFeetWorldY - opts.landingFeetWorldY) > opts.dockYTolM) return false;
  const lx = opts.px - opts.plateWorldX;
  const lz = opts.pz - opts.plateWorldZ;
  return fpElevPlayerInsideCabAuthoritativePlateLocal(
    lx,
    lz,
    opts.py,
    opts.cabFeetWorldY,
    opts.inner,
  );
}

/**
 * Corridor / doorway “near” volumes stay on while the cab moves (hallway use). If the player is
 * **inside** the authoritative cab volume and the shaft is **moving**, those overlaps are ignored
 * so HUD / E never imply a working toggle until the car is idle (sync server
 * `near_exterior_door_toggle_pose_for_player`).
 */
export function fpElevLandingExteriorDoorNearWhileShaftAuthorized(opts: {
  rawNear: boolean;
  phaseMoving: boolean;
  inAuthoritativeCab: boolean;
}): boolean {
  if (!opts.rawNear) return false;
  if (!opts.phaseMoving) return true;
  return !opts.inAuthoritativeCab;
}

/**
 * World-space point near the center of the exterior door opening, used as an aim target for
 * fallback interaction selection when the raycast misses the dedicated pick mesh.
 */
export function fpElevLandingExteriorDoorAimTargetWorld(
  doorFace: ElevatorDoorFace,
  plateWorldX: number,
  plateWorldZ: number,
  hx: number,
  hz: number,
  landingFeetWorldY: number,
): { x: number; y: number; z: number } {
  const y = landingFeetWorldY + 1.1;
  switch (doorFace) {
    case "e":
      return { x: plateWorldX + hx, y, z: plateWorldZ };
    case "w":
      return { x: plateWorldX - hx, y, z: plateWorldZ };
    case "n":
      return { x: plateWorldX, y, z: plateWorldZ + hz };
    case "s":
      return { x: plateWorldX, y, z: plateWorldZ - hz };
  }
}

/** Closed-door collision slab (plate-local). Sync server `exterior_collision_plate_local_ok`. */
export function fpElevLandingExteriorDoorCollisionPlateLocal(
  doorFace: ElevatorDoorFace,
  hx: number,
  hz: number,
  lx: number,
  lz: number,
  py: number,
  landingFeetWorldY: number,
): boolean {
  return exteriorPlateLocalInSlab(
    doorFace,
    hx,
    hz,
    lx,
    lz,
    py,
    landingFeetWorldY,
    EXTERIOR_COLLISION_L0,
    EXTERIOR_COLLISION_L1,
    faceLateralHalfM(doorFace, hx, hz) + EXTERIOR_COLLISION_LZ_PAD,
  );
}

export function fpElevExteriorDoorBlocksPassage(swingOpen01: number): boolean {
  return swingOpen01 < EXTERIOR_DOOR_COLLISION_OPEN_THRESH;
}

function innerCabHeightM(layout: ElevatorShaftLayout): number {
  return Math.max(1.8, layout.sy - 2 * 0.11 - 0.14);
}

function landingFrontFaceLocal(
  face: ElevatorDoorFace,
  outerHx: number,
  outerHz: number,
  lx: number,
  lz: number,
): boolean {
  switch (face) {
    case "e":
      return (
        lx >= outerHx - LANDING_FRONT_WALL_SLAB_IN &&
        lx <= outerHx + LANDING_FRONT_WALL_SLAB_OUT &&
        Math.abs(lz) <= outerHz
      );
    case "w":
      return (
        lx <= -outerHx + LANDING_FRONT_WALL_SLAB_IN &&
        lx >= -outerHx - LANDING_FRONT_WALL_SLAB_OUT &&
        Math.abs(lz) <= outerHz
      );
    case "n":
      return (
        lz >= outerHz - LANDING_FRONT_WALL_SLAB_IN &&
        lz <= outerHz + LANDING_FRONT_WALL_SLAB_OUT &&
        Math.abs(lx) <= outerHx
      );
    case "s":
      return (
        lz <= -outerHz + LANDING_FRONT_WALL_SLAB_IN &&
        lz >= -outerHz - LANDING_FRONT_WALL_SLAB_OUT &&
        Math.abs(lx) <= outerHx
      );
  }
}

function landingFrontDoorLaneLocal(
  face: ElevatorDoorFace,
  outerHx: number,
  outerHz: number,
  lx: number,
  lz: number,
): boolean {
  if (!landingFrontFaceLocal(face, outerHx, outerHz, lx, lz)) return false;
  return face === "e" || face === "w"
    ? Math.abs(lz) <= LANDING_FRONT_PASSAGE_HALF_W_M
    : Math.abs(lx) <= LANDING_FRONT_PASSAGE_HALF_W_M;
}

/**
 * Hoistway front “passage” for collision: when the corridor swing is clear, allow entry unless the
 * car is **docked at this landing** with interior doors still shut. Matches server
 * `elevator::landing_front_passage_open`.
 */
export function landingFrontPassageOpen(opts: {
  swingOpen01: number;
  cabFloorY: number;
  landingFeetY: number;
  cabDoorOpen01: number;
}): boolean {
  if (fpElevExteriorDoorBlocksPassage(opts.swingOpen01)) return false;
  const dockedHere =
    Math.abs(opts.cabFloorY - opts.landingFeetY) <= LANDING_PASSAGE_DOCK_Y_TOL_M;
  if (!dockedHere) return true;
  return opts.cabDoorOpen01 >= ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN;
}

function inClosedCabOutsideDoorSlab(
  face: ElevatorDoorFace,
  hx: number,
  hz: number,
  lx: number,
  lz: number,
): boolean {
  const doorHalf = faceLateralHalfM(face, hx, hz) + CLOSED_CAB_OUTSIDE_WIDTH_PAD;
  switch (face) {
    case "e":
      return lx >= hx - CLOSED_CAB_OUTSIDE_SLAB_IN && lx <= hx + CLOSED_CAB_OUTSIDE_SLAB_OUT && Math.abs(lz) <= doorHalf;
    case "w":
      return lx <= -hx + CLOSED_CAB_OUTSIDE_SLAB_IN && lx >= -hx - CLOSED_CAB_OUTSIDE_SLAB_OUT && Math.abs(lz) <= doorHalf;
    case "n":
      return lz >= hz - CLOSED_CAB_OUTSIDE_SLAB_IN && lz <= hz + CLOSED_CAB_OUTSIDE_SLAB_OUT && Math.abs(lx) <= doorHalf;
    case "s":
      return lz <= -hz + CLOSED_CAB_OUTSIDE_SLAB_IN && lz >= -hz - CLOSED_CAB_OUTSIDE_SLAB_OUT && Math.abs(lx) <= doorHalf;
  }
}

/**
 * Client-side block (FP prediction does not run the full static solid sweep here).
 * Geometry matches server `elevator::generated_player_collision` / exterior swing slab when
 * `fpElevExteriorDoorSolidPlayerSlabActive` (nearly closed).
 */
export function fpElevApplyClosedExteriorDoorCollisionClamp(
  pos: { x: number; y: number; z: number },
  vel: Vector3,
  opts: {
    ox: number;
    oz: number;
    landingRows: Iterable<{
      shaftKey: string;
      level: number;
      swingOpen01: number;
    }>;
    layoutByKey: Map<string, ElevatorShaftLayout>;
    carByShaft: Map<string, { plateX: number; plateZ: number }>;
    feetYForLayout: (layout: ElevatorShaftLayout, level: number) => number;
  },
): void {
  for (const row of opts.landingRows) {
    if (!fpElevExteriorDoorSolidPlayerSlabActive(row.swingOpen01)) continue;
    const layout = opts.layoutByKey.get(row.shaftKey);
    const car = opts.carByShaft.get(row.shaftKey);
    if (!layout || !car) continue;
    const { halfX: hx, halfZ: hz } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);
    const plateX = opts.ox + car.plateX;
    const plateZ = opts.oz + car.plateZ;
    const fy = opts.feetYForLayout(layout, row.level);
    if (
      !fpElevLandingExteriorDoorCollisionPlateLocal(
        layout.doorFace,
        hx,
        hz,
        pos.x - plateX,
        pos.z - plateZ,
        pos.y,
        fy,
      )
    ) {
      continue;
    }
    const px = pos.x;
    const pz = pos.z;
    const f = layout.doorFace;
    const mid = (EXTERIOR_COLLISION_L0 + EXTERIOR_COLLISION_L1) * 0.5;
    if (f === "e") {
      const lo = plateX + hx + EXTERIOR_COLLISION_L0;
      const hi = plateX + hx + EXTERIOR_COLLISION_L1;
      pos.x = pos.x <= plateX + hx + mid ? lo - 0.07 : hi + 0.08;
    } else if (f === "w") {
      const lo = plateX - hx - EXTERIOR_COLLISION_L1;
      const hi = plateX - hx - EXTERIOR_COLLISION_L0;
      pos.x = pos.x >= plateX - hx - mid ? hi + 0.07 : lo - 0.08;
    } else if (f === "n") {
      const lo = plateZ + hz + EXTERIOR_COLLISION_L0;
      const hi = plateZ + hz + EXTERIOR_COLLISION_L1;
      pos.z = pos.z <= plateZ + hz + mid ? lo - 0.07 : hi + 0.08;
    } else {
      const lo = plateZ - hz - EXTERIOR_COLLISION_L1;
      const hi = plateZ - hz - EXTERIOR_COLLISION_L0;
      pos.z = pos.z >= plateZ - hz - mid ? hi + 0.07 : lo - 0.08;
    }
    if (pos.x > px && vel.x < 0) vel.x = 0;
    if (pos.x < px && vel.x > 0) vel.x = 0;
    if (pos.z > pz && vel.z < 0) vel.z = 0;
    if (pos.z < pz && vel.z > 0) vel.z = 0;
  }
}

/** Client-side blocker for approaching a closed automatic cab door from the hallway side. */
export function fpElevApplyClosedCabDoorOutsideClamp(
  pos: { x: number; y: number; z: number },
  vel: Vector3,
  opts: {
    ox: number;
    oz: number;
    cars: Iterable<{
      shaftKey: string;
      doorOpen01: number;
      cabFloorY: number;
      plateX: number;
      plateZ: number;
    }>;
    layoutByKey: Map<string, ElevatorShaftLayout>;
  },
): void {
  for (const car of opts.cars) {
    if (car.doorOpen01 >= ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN) continue;
    const layout = opts.layoutByKey.get(car.shaftKey);
    if (!layout) continue;
    const { halfX: hx, halfZ: hz } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);
    const innerH = Math.max(1.8, layout.sy - 2 * 0.11 - 0.14);
    if (pos.y < car.cabFloorY - 0.22 || pos.y > car.cabFloorY + innerH + 0.38) continue;
    const plateX = opts.ox + car.plateX;
    const plateZ = opts.oz + car.plateZ;
    const lx = pos.x - plateX;
    const lz = pos.z - plateZ;
    if (!inClosedCabOutsideDoorSlab(layout.doorFace, hx, hz, lx, lz)) continue;
    const px = pos.x;
    const pz = pos.z;
    switch (layout.doorFace) {
      case "e":
        pos.x = plateX + hx + CLOSED_CAB_OUTSIDE_SLAB_OUT + 0.08;
        break;
      case "w":
        pos.x = plateX - hx - CLOSED_CAB_OUTSIDE_SLAB_OUT - 0.08;
        break;
      case "n":
        pos.z = plateZ + hz + CLOSED_CAB_OUTSIDE_SLAB_OUT + 0.08;
        break;
      case "s":
        pos.z = plateZ - hz - CLOSED_CAB_OUTSIDE_SLAB_OUT - 0.08;
        break;
    }
    if (pos.x > px && vel.x < 0) vel.x = 0;
    if (pos.x < px && vel.x > 0) vel.x = 0;
    if (pos.z > pz && vel.z < 0) vel.z = 0;
    if (pos.z < pz && vel.z > 0) vel.z = 0;
  }
}

/** Hallway-side hoistway front wall / doorway blocker. Prevents entering shaft through solid walls. */
export function fpElevApplyLandingHoistwayFrontWallClamp(
  pos: { x: number; y: number; z: number },
  vel: Vector3,
  opts: {
    ox: number;
    oz: number;
    landingRows: Iterable<{
      shaftKey: string;
      level: number;
      swingOpen01: number;
    }>;
    carsByShaft: Map<
      string,
      {
        currentLevel: number;
        doorOpen01: number;
        cabFloorY: number;
        plateX: number;
        plateZ: number;
      }
    >;
    layoutByKey: Map<string, ElevatorShaftLayout>;
    feetYForLayout: (layout: ElevatorShaftLayout, level: number) => number;
  },
): void {
  for (const row of opts.landingRows) {
    const layout = opts.layoutByKey.get(row.shaftKey);
    const car = opts.carsByShaft.get(row.shaftKey);
    if (!layout || !car) continue;
    const fy = opts.feetYForLayout(layout, row.level);
    const innerH = innerCabHeightM(layout);
    if (pos.y < fy - 0.22 || pos.y > fy + innerH + 0.38) continue;
    const plateX = opts.ox + car.plateX;
    const plateZ = opts.oz + car.plateZ;
    const lx = pos.x - plateX;
    const lz = pos.z - plateZ;
    const outerHx = layout.sx * 0.5;
    const outerHz = layout.sz * 0.5;
    if (!landingFrontFaceLocal(layout.doorFace, outerHx, outerHz, lx, lz)) continue;
    const inDoorLane = landingFrontDoorLaneLocal(layout.doorFace, outerHx, outerHz, lx, lz);
    if (
      inDoorLane &&
      landingFrontPassageOpen({
        swingOpen01: row.swingOpen01,
        cabFloorY: car.cabFloorY,
        landingFeetY: fy,
        cabDoorOpen01: car.doorOpen01,
      })
    ) {
      continue;
    }
    const px = pos.x;
    const pz = pos.z;
    switch (layout.doorFace) {
      case "e":
        pos.x = plateX + outerHx + LANDING_FRONT_WALL_SLAB_OUT + LANDING_FRONT_WALL_PUSH_OUT;
        break;
      case "w":
        pos.x = plateX - outerHx - LANDING_FRONT_WALL_SLAB_OUT - LANDING_FRONT_WALL_PUSH_OUT;
        break;
      case "n":
        pos.z = plateZ + outerHz + LANDING_FRONT_WALL_SLAB_OUT + LANDING_FRONT_WALL_PUSH_OUT;
        break;
      case "s":
        pos.z = plateZ - outerHz - LANDING_FRONT_WALL_SLAB_OUT - LANDING_FRONT_WALL_PUSH_OUT;
        break;
    }
    if (pos.x > px && vel.x < 0) vel.x = 0;
    if (pos.x < px && vel.x > 0) vel.x = 0;
    if (pos.z > pz && vel.z < 0) vel.z = 0;
    if (pos.z < pz && vel.z > 0) vel.z = 0;
  }
}

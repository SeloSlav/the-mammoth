import { elevatorCabGameplayHalfExtentsM, type ElevatorShaftLayout } from "@the-mammoth/world";
import type { ElevatorDoorFace } from "./fpElevatorLabels.js";
import type { Vector3 } from "three";
import { ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN } from "./fpElevatorConstants.js";

/** Match server `elevator::EXT_DOOR_W`. */
export const EXTERIOR_DOOR_W_M = 1.86;
/** Match server `elevator::EXT_DOOR_H`. */
export const EXTERIOR_DOOR_H_M = 2.05;
/** Match server `elevator::EXT_DOOR_COLLISION_OPEN_THRESH`. */
export const EXTERIOR_DOOR_COLLISION_OPEN_THRESH = 0.88;

/** Narrow-ish strip at the sill for **E**. Must extend past the closed-door push-out so the door stays usable. Sync server `EXT_INTERACT_*`. */
export const EXTERIOR_INTERACT_L0 = -0.28;
export const EXTERIOR_INTERACT_L1 = 0.82;
export const EXTERIOR_INTERACT_LZ_PAD = 0.08;
export const EXTERIOR_STRIP_Y0 = 0.05;
export const EXTERIOR_STRIP_Y1 = 2.25;

/** Wider slab for **physics** while the door is closed. Sync server `EXT_COLLISION_*`. */
export const EXTERIOR_COLLISION_L0 = -0.55;
export const EXTERIOR_COLLISION_L1 = 0.92;
export const EXTERIOR_COLLISION_LZ_PAD = 0.18;
export const EXTERIOR_INTERACT_WORLD_RADIUS_M = 1.6;
export const EXTERIOR_INTERACT_WORLD_Y_HALF_M = 1.3;

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

const CLOSED_CAB_OUTSIDE_SLAB_IN = 0.28;
const CLOSED_CAB_OUTSIDE_SLAB_OUT = 1.05;
const CLOSED_CAB_OUTSIDE_WIDTH_PAD = 0.32;

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
 * Client-side block (FP prediction has no wall collision; server also clamps).
 * Mirrors `elevator::clamp_player_exterior_landing_doors` push-out logic.
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
    if (!fpElevExteriorDoorBlocksPassage(row.swingOpen01)) continue;
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

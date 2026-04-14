import type { ElevatorDoorFace } from "./fpElevatorLabels.js";

/** Match server `elevator::EXT_DOOR_W`. */
export const EXTERIOR_DOOR_W_M = 1.86;
/** Match server `elevator::EXT_DOOR_H`. */
export const EXTERIOR_DOOR_H_M = 2.05;
/** Match server `elevator::EXT_DOOR_COLLISION_OPEN_THRESH`. */
export const EXTERIOR_DOOR_COLLISION_OPEN_THRESH = 0.88;
/** Match server `elevator::EXT_STRIP_*` — plate-local sill strip for E + physics. */
export const EXTERIOR_STRIP_L0 = -0.35;
export const EXTERIOR_STRIP_L1 = 0.36;
export const EXTERIOR_STRIP_LZ_PAD = 0.06;
export const EXTERIOR_STRIP_Y0 = 0.05;
export const EXTERIOR_STRIP_Y1 = 2.25;

export function landingExteriorDoorRowKey(shaftKey: string, level: number): string {
  return `${shaftKey}|${level >>> 0}`;
}

/**
 * True when feet are in the narrow plate-local volume at this landing’s swing door (E toggles).
 * Must match server `exterior_toggle_plate_local_ok`.
 */
export function fpElevLandingExteriorDoorInteractPlateLocal(
  doorFace: ElevatorDoorFace,
  hx: number,
  hz: number,
  lx: number,
  lz: number,
  py: number,
  landingFeetWorldY: number,
): boolean {
  const y0 = landingFeetWorldY + EXTERIOR_STRIP_Y0;
  const y1 = landingFeetWorldY + EXTERIOR_STRIP_Y1;
  if (py < y0 || py > y1) return false;
  const zspan = EXTERIOR_DOOR_W_M * 0.5 + EXTERIOR_STRIP_LZ_PAD;
  switch (doorFace) {
    case "e": {
      const lo = hx + EXTERIOR_STRIP_L0;
      const hi = hx + EXTERIOR_STRIP_L1;
      return lx >= lo && lx <= hi && Math.abs(lz) <= zspan;
    }
    case "w": {
      const lo = -hx - EXTERIOR_STRIP_L1;
      const hi = -hx - EXTERIOR_STRIP_L0;
      return lx >= lo && lx <= hi && Math.abs(lz) <= zspan;
    }
    case "n": {
      const lo = hz + EXTERIOR_STRIP_L0;
      const hi = hz + EXTERIOR_STRIP_L1;
      return lz >= lo && lz <= hi && Math.abs(lx) <= zspan;
    }
    case "s": {
      const lo = -hz - EXTERIOR_STRIP_L1;
      const hi = -hz - EXTERIOR_STRIP_L0;
      return lz >= lo && lz <= hi && Math.abs(lx) <= zspan;
    }
  }
}

/** Authoritative door blocks passage when swing is below this (server + client hint). */
export function fpElevExteriorDoorBlocksPassage(swingOpen01: number): boolean {
  return swingOpen01 < EXTERIOR_DOOR_COLLISION_OPEN_THRESH;
}

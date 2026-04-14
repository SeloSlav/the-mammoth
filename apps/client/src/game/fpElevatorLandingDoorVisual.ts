import * as THREE from "three";
import type { LandingKitDef } from "@the-mammoth/schemas";
import {
  LANDING_DOOR_GLASS_PART_ID,
  populateExteriorLandingDoorSwing,
} from "@the-mammoth/world";
import type { ElevatorDoorFace } from "./fpElevatorLabels.js";
import { DOOR_H } from "./fpElevatorConstants.js";
import { EXTERIOR_DOOR_W_M } from "./fpElevatorLandingExteriorDoor.js";

const FLOOR_T = 0.08;
/** Max swing (rad) at `swingOpen01 === 1`. */
export const EXTERIOR_DOOR_SWING_MAX_RAD = 1.08;

export type ExteriorLandingDoorPivot = {
  structure: THREE.Group;
  swing: THREE.Group;
  swingSign: number;
};

export function createExteriorLandingDoorPivot(
  face: ElevatorDoorFace,
  hx: number,
  hz: number,
  redMat: THREE.MeshStandardMaterial,
  glassMat: THREE.MeshPhysicalMaterial,
  landingKitDef?: LandingKitDef,
): ExteriorLandingDoorPivot {
  const doorY = FLOOR_T + DOOR_H * 0.5 + 0.06;
  const structure = new THREE.Group();
  structure.name = "exterior_landing_door";
  const swing = new THREE.Group();
  swing.name = "exterior_landing_door_swing";
  structure.add(swing);
  populateExteriorLandingDoorSwing(swing, redMat, glassMat, landingKitDef);

  const jambZ = EXTERIOR_DOOR_W_M * 0.5 - 0.06;
  const swingSign = -1;

  if (face === "e") {
    structure.position.set(hx + 0.048, doorY, jambZ);
  } else if (face === "w") {
    structure.position.set(-hx - 0.048, doorY, jambZ);
    structure.rotation.y = Math.PI;
  } else if (face === "n") {
    structure.position.set(-jambZ, doorY, hz + 0.048);
    structure.rotation.y = -Math.PI * 0.5;
  } else {
    structure.position.set(jambZ, doorY, -hz - 0.048);
    structure.rotation.y = Math.PI * 0.5;
  }

  return { structure, swing, swingSign };
}

export { LANDING_DOOR_GLASS_PART_ID };

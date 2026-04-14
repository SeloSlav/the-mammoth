import * as THREE from "three";
import type { ElevatorDoorFace } from "./fpElevatorLabels.js";
import { DOOR_H } from "./fpElevatorConstants.js";
import { EXTERIOR_DOOR_W_M } from "./fpElevatorLandingExteriorDoor.js";

const FLOOR_T = 0.08;
/** Max swing (rad) at `swingOpen01 === 1`. */
export const EXTERIOR_DOOR_SWING_MAX_RAD = 1.08;

export type ExteriorLandingDoorPivot = {
  /** Fixed placement + base yaw for this face. */
  structure: THREE.Group;
  /** Child of `structure`; only this group's Y-rotation is driven by `swingOpen01`. */
  swing: THREE.Group;
  /** Multiply `swingOpen01 * EXTERIOR_DOOR_SWING_MAX_RAD` for `swing.rotation.y`. */
  swingSign: number;
};

function addEastStyleDoorMeshes(
  swing: THREE.Group,
  redMat: THREE.MeshStandardMaterial,
  glassMat: THREE.MeshStandardMaterial,
): void {
  const panelH = DOOR_H - 0.12;
  const panelW = EXTERIOR_DOOR_W_M - 0.1;
  const panelT = 0.056;

  const g = new THREE.BoxGeometry(panelT, panelH, panelW);
  const panel = new THREE.Mesh(g, redMat);
  panel.position.set(panelT * 0.5, 0, -(EXTERIOR_DOOR_W_M * 0.5 - 0.08));
  panel.castShadow = false;
  swing.add(panel);

  const glassGeom = new THREE.BoxGeometry(0.038, 0.44, 0.5);
  const glassMesh = new THREE.Mesh(glassGeom, glassMat);
  glassMesh.position.set(panelT * 0.5 + 0.008, 0.33, -(EXTERIOR_DOOR_W_M * 0.5 - 0.28));
  glassMesh.castShadow = false;
  glassMesh.renderOrder = 1;
  swing.add(glassMesh);
}

/**
 * Red corridor swing door + translucent upper window; hinge swings **out** from cab.
 */
export function createExteriorLandingDoorPivot(
  face: ElevatorDoorFace,
  hx: number,
  hz: number,
  redMat: THREE.MeshStandardMaterial,
  glassMat: THREE.MeshStandardMaterial,
): ExteriorLandingDoorPivot {
  const doorY = FLOOR_T + DOOR_H * 0.5 + 0.06;
  const structure = new THREE.Group();
  structure.name = "exterior_landing_door";
  const swing = new THREE.Group();
  swing.name = "exterior_landing_door_swing";
  structure.add(swing);
  addEastStyleDoorMeshes(swing, redMat, glassMat);

  const jambZ = EXTERIOR_DOOR_W_M * 0.5 - 0.06;
  let swingSign = 1;

  if (face === "e") {
    structure.position.set(hx + 0.048, doorY, jambZ);
  } else if (face === "w") {
    structure.position.set(-hx - 0.048, doorY, jambZ);
    structure.rotation.y = Math.PI;
    swingSign = -1;
  } else if (face === "n") {
    structure.position.set(-jambZ, doorY, hz + 0.048);
    structure.rotation.y = -Math.PI * 0.5;
  } else {
    structure.position.set(jambZ, doorY, -hz - 0.048);
    structure.rotation.y = Math.PI * 0.5;
    swingSign = -1;
  }

  return { structure, swing, swingSign };
}

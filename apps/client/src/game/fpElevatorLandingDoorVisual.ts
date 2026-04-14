import * as THREE from "three";
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

/**
 * Single swing door with a centered square glass lite at eye level.
 */
function addEastStyleDoorMeshes(
  swing: THREE.Group,
  redMat: THREE.MeshStandardMaterial,
  glassMat: THREE.MeshPhysicalMaterial,
): void {
  const panelH = DOOR_H - 0.12;
  const panelW = EXTERIOR_DOOR_W_M - 0.1;
  const panelT = 0.056;
  const centerZ = -panelW * 0.5;
  const windowSide = 0.46;
  const windowCenterY = 0.46;
  const railTopH = Math.max(0.12, panelH * 0.5 - (windowCenterY + windowSide * 0.5));
  const railBotH = Math.max(0.12, windowCenterY - windowSide * 0.5 + panelH * 0.5);
  const stileW = Math.max(0.12, (panelW - windowSide) * 0.5);

  const addRed = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), redMat);
    m.position.set(x, y, z);
    m.castShadow = false;
    swing.add(m);
  };

  addRed(panelT, railTopH, panelW, panelT * 0.5, panelH * 0.5 - railTopH * 0.5, centerZ);
  addRed(panelT, railBotH, panelW, panelT * 0.5, -panelH * 0.5 + railBotH * 0.5, centerZ);
  addRed(
    panelT,
    windowSide,
    stileW,
    panelT * 0.5,
    windowCenterY,
    -stileW * 0.5,
  );
  addRed(
    panelT,
    windowSide,
    stileW,
    panelT * 0.5,
    windowCenterY,
    -panelW + stileW * 0.5,
  );

  const glassGeom = new THREE.BoxGeometry(0.046, windowSide - 0.02, windowSide - 0.02);
  const glassMesh = new THREE.Mesh(glassGeom, glassMat);
  glassMesh.position.set(panelT * 0.5 + 0.014, windowCenterY, centerZ);
  glassMesh.castShadow = false;
  glassMesh.renderOrder = 2;
  swing.add(glassMesh);
}

export function createExteriorLandingDoorPivot(
  face: ElevatorDoorFace,
  hx: number,
  hz: number,
  redMat: THREE.MeshStandardMaterial,
  glassMat: THREE.MeshPhysicalMaterial,
): ExteriorLandingDoorPivot {
  const doorY = FLOOR_T + DOOR_H * 0.5 + 0.06;
  const structure = new THREE.Group();
  structure.name = "exterior_landing_door";
  const swing = new THREE.Group();
  swing.name = "exterior_landing_door_swing";
  structure.add(swing);
  addEastStyleDoorMeshes(swing, redMat, glassMat);

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

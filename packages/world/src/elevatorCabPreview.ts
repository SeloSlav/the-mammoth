import * as THREE from "three";
import type { ElevatorCabDef } from "@the-mammoth/schemas";
import { elevatorHoistwayInnerHalfExtents } from "./elevatorShaftLayout.js";
import type { ElevatorShaftLayout } from "./elevatorShaftLayout.js";
import { applyCabMaterialSlot } from "./elevatorVisualMaterialUtils.js";

/** Mirrors `apps/client/src/game/fpElevatorConstants.ts` for visual parity. */
const DOOR_W = 1.86;
const DOOR_H = 2.05;
const DOOR_TH = 0.07;
const DOOR_SLIDE_M = 0.82;
const CAR_INNER_MARGIN = 0.07;
const CAR_CEIL_BELOW_SHAFT_TOP = 0.14;

function doorSlideAxis(face: ElevatorShaftLayout["doorFace"]): THREE.Vector3 {
  switch (face) {
    case "e":
    case "w":
      return new THREE.Vector3(0, 0, 1);
    case "n":
    case "s":
      return new THREE.Vector3(1, 0, 0);
  }
}

function stdMatFromSlot(
  def: ElevatorCabDef | undefined,
  key: "wall" | "floor" | "door" | "ceiling",
  fallbackHex: number,
): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: fallbackHex,
    roughness: 0.72,
    metalness: 0.08,
  });
  applyCabMaterialSlot(m, def?.materials?.[key]);
  return m;
}

/**
 * Editor/game-shared cab interior preview (car only): same proportions as {@link FpElevatorShaftVisual}.
 */
export function buildElevatorCabCarPreviewRoot(args: {
  layout: ElevatorShaftLayout;
  def?: ElevatorCabDef;
  /** If true, doors are left at50% open for framing. */
  previewDoorOpen01?: number;
}): THREE.Group {
  const { layout, def, previewDoorOpen01 = 0.5 } = args;
  const { halfX, halfZ } = elevatorHoistwayInnerHalfExtents(layout.sx, layout.sz);
  const innerH = layout.sy - 2 * 0.11 - CAR_CEIL_BELOW_SHAFT_TOP;
  const hx = Math.max(0.12, halfX - CAR_INNER_MARGIN);
  const hz = Math.max(0.12, halfZ - CAR_INNER_MARGIN);
  const cabinH = Math.max(1.8, innerH);

  const wallMat = stdMatFromSlot(def, "wall", 0x6a6f78);
  const floorMat = stdMatFromSlot(def, "floor", 0x4d5258);
  const doorMat = stdMatFromSlot(def, "door", 0x8a929e);
  const ceilMat = stdMatFromSlot(def, "ceiling", 0x6a6f78);

  const root = new THREE.Group();
  root.name = "editor_elevator_cab_preview";

  const floorT = 0.08;
  const wallT = 0.06;
  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(hx * 2 - wallT * 2, floorT, hz * 2 - wallT * 2),
    floorMat,
  );
  floorMesh.name = "cab_floor";
  floorMesh.userData.editorCabPartId = "cab_floor";
  floorMesh.position.set(0, floorT * 0.5, 0);
  root.add(floorMesh);

  const ceil = new THREE.Mesh(
    new THREE.BoxGeometry(hx * 2 - wallT * 2, 0.07, hz * 2 - wallT * 2),
    ceilMat,
  );
  ceil.name = "cab_ceiling";
  ceil.userData.editorCabPartId = "cab_ceiling";
  ceil.position.set(0, cabinH - 0.035, 0);
  root.add(ceil);

  const addWall = (
    name: string,
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
    m.name = name;
    m.userData.editorCabPartId = name;
    m.position.set(x, y, z);
    root.add(m);
  };

  const midY = cabinH * 0.5 + floorT;
  const wallH = cabinH - floorT - 0.08;
  const face = layout.doorFace;
  if (face === "e" || face === "w") {
    const xSign = face === "e" ? 1 : -1;
    addWall("cab_wall_back", wallT, wallH, hz * 2, -xSign * (hx - wallT * 0.5), midY, 0);
    addWall("cab_wall_side_n", hx * 2 - wallT * 2, wallH, wallT, 0, midY, hz - wallT * 0.5);
    addWall("cab_wall_side_s", hx * 2 - wallT * 2, wallH, wallT, 0, midY, -hz + wallT * 0.5);
  } else {
    const zSign = face === "n" ? 1 : -1;
    addWall("cab_wall_back", hx * 2, wallH, wallT, 0, midY, -zSign * (hz - wallT * 0.5));
    addWall("cab_wall_side_e", wallT, wallH, hz * 2 - wallT * 2, hx - wallT * 0.5, midY, 0);
    addWall("cab_wall_side_w", wallT, wallH, hz * 2 - wallT * 2, -hx + wallT * 0.5, midY, 0);
  }

  const doorL = new THREE.Group();
  const doorR = new THREE.Group();
  const leafW = DOOR_W * 0.5 - 0.02;
  const leafGeom = new THREE.BoxGeometry(
    face === "e" || face === "w" ? DOOR_TH : leafW,
    DOOR_H,
    face === "e" || face === "w" ? leafW : DOOR_TH,
  );
  const lm = new THREE.Mesh(leafGeom, doorMat);
  lm.name = "cab_door_leaf_l";
  lm.userData.editorCabPartId = "cab_door_leaf_l";
  doorL.add(lm);
  const rm = new THREE.Mesh(leafGeom.clone(), doorMat);
  rm.name = "cab_door_leaf_r";
  rm.userData.editorCabPartId = "cab_door_leaf_r";
  doorR.add(rm);

  const doorX =
    face === "e" ? hx - DOOR_TH * 0.5 - 0.02 : face === "w" ? -hx + DOOR_TH * 0.5 + 0.02 : 0;
  const doorZ =
    face === "n" ? hz - DOOR_TH * 0.5 - 0.02 : face === "s" ? -hz + DOOR_TH * 0.5 + 0.02 : 0;
  const doorY = floorT + DOOR_H * 0.5 + 0.06;
  const t = doorSlideAxis(face);
  const slide = THREE.MathUtils.lerp(0, DOOR_SLIDE_M, previewDoorOpen01);
  const tL = t.clone().multiplyScalar(-DOOR_W * 0.25 - slide);
  const tR = t.clone().multiplyScalar(DOOR_W * 0.25 + slide);
  doorL.position.set(
    doorX + (face === "n" || face === "s" ? tL.x : 0),
    doorY,
    doorZ + (face === "e" || face === "w" ? tL.z : 0),
  );
  doorR.position.set(
    doorX + (face === "n" || face === "s" ? tR.x : 0),
    doorY,
    doorZ + (face === "e" || face === "w" ? tR.z : 0),
  );
  doorL.name = "cab_door_l";
  doorR.name = "cab_door_r";
  root.add(doorL);
  root.add(doorR);

  applyElevatorCabPartTransforms(root, def);
  return root;
}

/** Apply {@link ElevatorCabDef.partTransforms} to meshes tagged with `userData.editorCabPartId`. */
export function applyElevatorCabPartTransforms(
  root: THREE.Object3D,
  def: ElevatorCabDef | undefined,
): void {
  const pt = def?.partTransforms;
  if (!pt) return;
  root.traverse((o) => {
    const id = o.userData.editorCabPartId as string | undefined;
    if (!id) return;
    const p = pt[id];
    if (!p) return;
    if (p.position)
      o.position.set(p.position[0], p.position[1], p.position[2]);
    if (p.scale) o.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    if (p.rotation)
      o.quaternion.set(p.rotation[0], p.rotation[1], p.rotation[2], p.rotation[3] ?? 1);
  });
}

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
const FLOOR_BTN_W = 0.12;
const FLOOR_BTN_H = 0.092;
const FLOOR_BTN_D = 0.014;
const FLOOR_GAP = 0.014;
const FLOOR_COLS = 3;
const FLOOR_ATLAS_COLS = 5;
const FLOOR_ATLAS_CELL_W = 64;
const FLOOR_ATLAS_CELL_H = 48;

function floorButtonLabel(levelIndex: number): string {
  return levelIndex <= 1 ? "PR" : String(levelIndex);
}

function buildElevFloorAtlas(maxLevel: number): THREE.CanvasTexture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex as unknown as THREE.CanvasTexture;
  }
  const rows = Math.max(1, Math.ceil(Math.max(1, maxLevel) / FLOOR_ATLAS_COLS));
  const canvas = document.createElement("canvas");
  canvas.width = FLOOR_ATLAS_COLS * FLOOR_ATLAS_CELL_W;
  canvas.height = rows * FLOOR_ATLAS_CELL_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d");
  for (let level = 1; level <= maxLevel; level++) {
    const idx = level - 1;
    const col = idx % FLOOR_ATLAS_COLS;
    const row = Math.floor(idx / FLOOR_ATLAS_COLS);
    const x0 = col * FLOOR_ATLAS_CELL_W;
    const y0 = row * FLOOR_ATLAS_CELL_H;
    ctx.fillStyle = "#2a3138";
    ctx.fillRect(x0, y0, FLOOR_ATLAS_CELL_W, FLOOR_ATLAS_CELL_H);
    ctx.strokeStyle = "rgba(140, 200, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 2, y0 + 2, FLOOR_ATLAS_CELL_W - 4, FLOOR_ATLAS_CELL_H - 4);
    ctx.fillStyle = "#e4ecff";
    ctx.font = "700 19px system-ui,Segoe UI,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      floorButtonLabel(level),
      x0 + FLOOR_ATLAS_CELL_W * 0.5,
      y0 + FLOOR_ATLAS_CELL_H * 0.5,
    );
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function applyAtlasUvToPlaneGeometry(
  geom: THREE.PlaneGeometry,
  levelIndex1Based: number,
  atlasRows: number,
): void {
  const idx = levelIndex1Based - 1;
  const col = idx % FLOOR_ATLAS_COLS;
  const row = Math.floor(idx / FLOOR_ATLAS_COLS);
  const u0 = col / FLOOR_ATLAS_COLS;
  const u1 = (col + 1) / FLOOR_ATLAS_COLS;
  const v1 = 1 - row / atlasRows;
  const v0 = 1 - (row + 1) / atlasRows;
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const uOld = uv.getX(i);
    const vOld = uv.getY(i);
    uv.setX(i, u1 - uOld * (u1 - u0));
    uv.setY(i, v0 + vOld * (v1 - v0));
  }
  uv.needsUpdate = true;
}

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

export type ElevatorCabFloorButtonVisual = {
  level: number;
  bodyMesh: THREE.Mesh;
  labelMesh: THREE.Mesh;
};

export type ElevatorCabCarVisual = {
  root: THREE.Group;
  panelRoot: THREE.Group;
  doorL: THREE.Group | null;
  doorR: THREE.Group | null;
  floorButtons: ElevatorCabFloorButtonVisual[];
};

type BuildElevatorCabCarVisualArgs = {
  layout: ElevatorShaftLayout;
  def?: ElevatorCabDef;
  maxLevel?: number;
  /** Door opening fraction used for static previews or initial game state. */
  doorOpen01?: number;
  /** Editor cab authoring hides doors so transforms stay focused on authored shell/panel parts. */
  includeDoors?: boolean;
  /** Optional override for floor label faces (gameplay swaps highlight materials at runtime). */
  floorButtonLabelMaterial?: THREE.Material;
  rootName?: string;
};

function panelBoardPosition(args: {
  face: ElevatorShaftLayout["doorFace"];
  hx: number;
  hz: number;
  wallT: number;
  floorT: number;
  boardDepth: number;
  gridRows: number;
}): { position: THREE.Vector3; rotationY: number } {
  const { face, hx, hz, wallT, floorT, boardDepth, gridRows } = args;
  const panelCenterY =
    floorT + 1.12 + Math.max(0, gridRows - 1) * (FLOOR_BTN_H + FLOOR_GAP) * 0.5;
  const boardInset = boardDepth * 0.5;
  if (face === "e") {
    return {
      position: new THREE.Vector3(-hx + wallT + boardInset, panelCenterY, 0),
      rotationY: 0,
    };
  }
  if (face === "w") {
    return {
      position: new THREE.Vector3(hx - wallT - boardInset, panelCenterY, 0),
      rotationY: 0,
    };
  }
  if (face === "n") {
    return {
      position: new THREE.Vector3(0, panelCenterY, -hz + wallT + boardInset),
      rotationY: 0,
    };
  }
  return {
    position: new THREE.Vector3(0, panelCenterY, hz - wallT - boardInset),
    rotationY: Math.PI,
  };
}

/**
 * Shared elevator cab shell/panel geometry used by both the editor preview and the in-game car.
 */
export function buildElevatorCabCarVisual(args: BuildElevatorCabCarVisualArgs): ElevatorCabCarVisual {
  const {
    layout,
    def,
    maxLevel = 1,
    doorOpen01 = 0.5,
    includeDoors = true,
    floorButtonLabelMaterial,
    rootName = "editor_elevator_cab_preview",
  } = args;
  const { halfX, halfZ } = elevatorHoistwayInnerHalfExtents(layout.sx, layout.sz);
  const innerH = layout.sy - 2 * 0.11 - CAR_CEIL_BELOW_SHAFT_TOP;
  const hx = Math.max(0.12, halfX - CAR_INNER_MARGIN);
  const hz = Math.max(0.12, halfZ - CAR_INNER_MARGIN);
  const cabinH = Math.max(1.8, innerH);

  const wallMat = stdMatFromSlot(def, "wall", 0x6a6f78);
  const floorMat = stdMatFromSlot(def, "floor", 0x4d5258);
  const doorMat = stdMatFromSlot(def, "door", 0x8a929e);
  const ceilMat = stdMatFromSlot(def, "ceiling", 0x6a6f78);
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x2a3138,
    roughness: 0.42,
    metalness: 0.22,
  });
  const clampedMaxLevel = Math.max(1, maxLevel);
  const atlasRows = Math.max(1, Math.ceil(clampedMaxLevel / FLOOR_ATLAS_COLS));
  const buttonMat =
    floorButtonLabelMaterial ??
    new THREE.MeshStandardMaterial({
      map: buildElevFloorAtlas(clampedMaxLevel),
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.12,
      emissive: 0x000000,
      side: THREE.DoubleSide,
    });

  const root = new THREE.Group();
  root.name = rootName;

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

  let doorL: THREE.Group | null = null;
  let doorR: THREE.Group | null = null;
  if (includeDoors) {
    doorL = new THREE.Group();
    doorR = new THREE.Group();
    const leafW = DOOR_W * 0.5 - 0.02;
    const leafGeom = new THREE.BoxGeometry(
      face === "e" || face === "w" ? DOOR_TH : leafW,
      DOOR_H,
      face === "e" || face === "w" ? leafW : DOOR_TH,
    );
    const lm = new THREE.Mesh(leafGeom, doorMat);
    lm.name = "cab_door_leaf_l";
    doorL.add(lm);
    const rm = new THREE.Mesh(leafGeom.clone(), doorMat);
    rm.name = "cab_door_leaf_r";
    doorR.add(rm);

    const doorX =
      face === "e" ? hx - DOOR_TH * 0.5 - 0.02 : face === "w" ? -hx + DOOR_TH * 0.5 + 0.02 : 0;
    const doorZ =
      face === "n" ? hz - DOOR_TH * 0.5 - 0.02 : face === "s" ? -hz + DOOR_TH * 0.5 + 0.02 : 0;
    const doorY = floorT + DOOR_H * 0.5 + 0.06;
    const t = doorSlideAxis(face);
    const slide = THREE.MathUtils.lerp(0, DOOR_SLIDE_M, doorOpen01);
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
  }

  const panelRoot = new THREE.Group();
  panelRoot.name = "cab_floor_panel";
  panelRoot.userData.editorCabPartId = "cab_floor_panel";
  const gridRows = Math.max(1, Math.ceil(clampedMaxLevel / FLOOR_COLS));
  const gridW = FLOOR_COLS * FLOOR_BTN_W + (FLOOR_COLS - 1) * FLOOR_GAP;
  const gridH = gridRows * FLOOR_BTN_H + Math.max(0, gridRows - 1) * FLOOR_GAP;
  const panelBoardDepth = 0.038;
  const buttonDepth = FLOOR_BTN_D;
  const panelBoard = new THREE.Mesh(
    face === "e" || face === "w"
      ? new THREE.BoxGeometry(
          panelBoardDepth,
          Math.max(0.72, gridH + 0.34),
          Math.max(0.34, gridW + 0.18),
        )
      : new THREE.BoxGeometry(
          Math.max(0.34, gridW + 0.18),
          Math.max(0.72, gridH + 0.34),
          panelBoardDepth,
        ),
    panelMat,
  );
  panelBoard.name = "cab_floor_panel_board";
  const boardPose = panelBoardPosition({
    face,
    hx,
    hz,
    wallT,
    floorT,
    boardDepth: panelBoardDepth,
    gridRows,
  });
  panelBoard.position.copy(boardPose.position);
  panelBoard.rotation.y = boardPose.rotationY;
  panelRoot.add(panelBoard);
  const zSpan = (FLOOR_COLS - 1) * (FLOOR_BTN_W + FLOOR_GAP);
  const z0 = -zSpan * 0.5;
  const y0 = floorT + 1.12;
  const floorButtons: ElevatorCabFloorButtonVisual[] = [];
  for (let level = 1; level <= clampedMaxLevel; level++) {
    const idx = level - 1;
    const col = idx % FLOOR_COLS;
    const row = Math.floor(idx / FLOOR_COLS);
    const ly = y0 + row * (FLOOR_BTN_H + FLOOR_GAP);
    const gridAlong = z0 + col * (FLOOR_BTN_W + FLOOR_GAP);
    const button = new THREE.Mesh(
      face === "e" || face === "w"
        ? new THREE.BoxGeometry(buttonDepth, FLOOR_BTN_H, FLOOR_BTN_W)
        : new THREE.BoxGeometry(FLOOR_BTN_W, FLOOR_BTN_H, buttonDepth),
      doorMat,
    );
    button.name = `cab_floor_button_body_${level}`;
    const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_BTN_W, FLOOR_BTN_H), buttonMat);
    applyAtlasUvToPlaneGeometry(facePlane.geometry, level, atlasRows);
    facePlane.name = `cab_floor_button_label_${level}`;
    const buttonFrontPad = 0.002;
    if (face === "e") {
      const wallX = -hx + wallT;
      button.position.set(wallX + panelBoardDepth + buttonDepth * 0.5, ly, gridAlong);
      facePlane.position.set(wallX + panelBoardDepth + buttonDepth + buttonFrontPad, ly, gridAlong);
      facePlane.rotation.y = -Math.PI * 0.5;
    } else if (face === "w") {
      const wallX = hx - wallT;
      button.position.set(wallX - panelBoardDepth - buttonDepth * 0.5, ly, gridAlong);
      facePlane.position.set(wallX - panelBoardDepth - buttonDepth - buttonFrontPad, ly, gridAlong);
      facePlane.rotation.y = Math.PI * 0.5;
    } else if (face === "n") {
      const wallZ = -hz + wallT;
      button.position.set(gridAlong, ly, wallZ + panelBoardDepth + buttonDepth * 0.5);
      facePlane.position.set(gridAlong, ly, wallZ + panelBoardDepth + buttonDepth + buttonFrontPad);
    } else {
      const wallZ = hz - wallT;
      button.position.set(gridAlong, ly, wallZ - panelBoardDepth - buttonDepth * 0.5);
      facePlane.position.set(gridAlong, ly, wallZ - panelBoardDepth - buttonDepth - buttonFrontPad);
      facePlane.rotation.y = Math.PI;
    }
    panelRoot.add(button);
    panelRoot.add(facePlane);
    floorButtons.push({ level, bodyMesh: button, labelMesh: facePlane });
  }
  root.add(panelRoot);

  applyElevatorCabPartTransforms(root, def);
  return { root, panelRoot, doorL, doorR, floorButtons };
}

/**
 * Editor/game-shared cab interior preview root.
 */
export function buildElevatorCabCarPreviewRoot(args: {
  layout: ElevatorShaftLayout;
  def?: ElevatorCabDef;
  maxLevel?: number;
  /** If true, doors are left at 50% open for framing. */
  previewDoorOpen01?: number;
  includeDoors?: boolean;
}): THREE.Group {
  return buildElevatorCabCarVisual({
    layout: args.layout,
    def: args.def,
    maxLevel: args.maxLevel,
    doorOpen01: args.previewDoorOpen01,
    includeDoors: args.includeDoors,
  }).root;
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

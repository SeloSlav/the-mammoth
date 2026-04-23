import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ElevatorCabDef } from "@the-mammoth/schemas";
import { shortFloorLabelForLevel, type FloorShortLabelMap } from "./buildingFloorLabels.js";
import { elevatorHoistwayInnerHalfExtents } from "./elevatorShaftLayout.js";
import type { ElevatorShaftLayout } from "./elevatorShaftLayout.js";
import { applyCabMaterialSlot } from "./elevatorVisualMaterialUtils.js";
import { EXTERIOR_DOOR_W_M } from "./elevatorCollisionTuning.js";
const DOOR_H = 2.05;
const DOOR_TH = 0.07;
const DOOR_SLIDE_M = 0.82;
/** Match `fpElevatorConstants.CAB_SLIDING_DOOR_CLOSED_OVERLAP_SLIDE_M` — hide bifolding seam at closed. */
const CAB_SLIDING_DOOR_CLOSED_OVERLAP_SLIDE_M = 0.014;
/**
 * Extra half-width on each bifolding leaf toward the side jambs (inner meeting edge unchanged).
 * Geometry only — fills the vertical slit at the frame.
 */
const CAB_DOOR_LEAF_OUTER_EDGE_EXTEND_M = 0.02;
const CAR_INNER_MARGIN = 0.07;
const CAR_CEIL_BELOW_SHAFT_TOP = 0.14;
const FLOOR_BTN_DIA = 0.116;
const FLOOR_BTN_FACE_DIA = 0.094;
const FLOOR_BTN_D = 0.018;
const FLOOR_GAP = 0.022;
const FLOOR_COLS = 3;
const FLOOR_ATLAS_COLS = 5;
const FLOOR_ATLAS_CELL_W = 64;
const FLOOR_ATLAS_CELL_H = 48;

function buildElevFloorAtlas(
  maxLevel: number,
  floorLabelByLevel?: FloorShortLabelMap,
): THREE.CanvasTexture {
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
    const cx = x0 + FLOOR_ATLAS_CELL_W * 0.5;
    const cy = y0 + FLOOR_ATLAS_CELL_H * 0.5;
    const faceR = Math.min(FLOOR_ATLAS_CELL_W, FLOOR_ATLAS_CELL_H) * 0.34;
    ctx.clearRect(x0, y0, FLOOR_ATLAS_CELL_W, FLOOR_ATLAS_CELL_H);
    ctx.fillStyle = "#0a0b0d";
    ctx.beginPath();
    ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f6fb";
    ctx.font = "700 18px system-ui,Segoe UI,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      shortFloorLabelForLevel(level, floorLabelByLevel),
      cx,
      cy - 3,
    );
    ctx.fillStyle = "rgba(244,246,251,0.9)";
    const brailleY = cy + 10;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * 5, brailleY, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function applyAtlasUvToGeometry(
  geom: THREE.BufferGeometry,
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

/** Unit normal of the cab-interior-facing side of the door-surround wall (world space, before part transforms). */
function mergedCabDoorSurroundInteriorNormal(
  face: ElevatorShaftLayout["doorFace"],
): THREE.Vector3 {
  switch (face) {
    case "e":
      return new THREE.Vector3(-1, 0, 0);
    case "w":
      return new THREE.Vector3(1, 0, 0);
    case "n":
      return new THREE.Vector3(0, 0, -1);
    case "s":
      return new THREE.Vector3(0, 0, 1);
  }
}

/**
 * Planar UVs on interior-facing triangles so wall maps tile continuously across the
 * jambs and header (one merged mesh instead of three separate boxes).
 */
function applyMergedCabDoorWallInteriorPlanarUvs(
  geom: THREE.BufferGeometry,
  face: ElevatorShaftLayout["doorFace"],
): void {
  geom.computeVertexNormals();
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  const norm = geom.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const uv = geom.getAttribute("uv") as THREE.BufferAttribute | undefined;
  if (!pos || !norm || !uv) return;
  const eps = 0.004;
  const t = mergedCabDoorSurroundInteriorNormal(face);
  for (let i = 0; i < pos.count; i++) {
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);
    if (
      Math.abs(nx - t.x) > eps ||
      Math.abs(ny - t.y) > eps ||
      Math.abs(nz - t.z) > eps
    ) {
      continue;
    }
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (face === "e" || face === "w") {
      uv.setXY(i, z, y);
    } else {
      uv.setXY(i, x, y);
    }
  }
  uv.needsUpdate = true;
}

function buildMergedCabDoorSurroundGeometryEw(
  face: "e" | "w",
  hx: number,
  wallT: number,
  midY: number,
  wallH: number,
  frontPanelSpan: number,
  frontPanelZ: number,
  frontTopPanelH: number,
  frontTopPanelY: number,
  doorClearWidthM: number,
): THREE.BufferGeometry {
  const xSign = face === "e" ? 1 : -1;
  const x = xSign * (hx - wallT * 0.5);
  const g1 = new THREE.BoxGeometry(wallT, wallH, frontPanelSpan);
  g1.translate(x, midY, frontPanelZ);
  const g2 = new THREE.BoxGeometry(wallT, wallH, frontPanelSpan);
  g2.translate(x, midY, -frontPanelZ);
  const g3 = new THREE.BoxGeometry(wallT, frontTopPanelH, doorClearWidthM);
  g3.translate(x, frontTopPanelY, 0);
  const merged = mergeGeometries([g1, g2, g3], false);
  if (!merged) throw new Error("buildMergedCabDoorSurroundGeometryEw: mergeGeometries failed");
  g1.dispose();
  g2.dispose();
  g3.dispose();
  applyMergedCabDoorWallInteriorPlanarUvs(merged, face);
  return merged;
}

function buildMergedCabDoorSurroundGeometryNs(
  face: "n" | "s",
  hz: number,
  wallT: number,
  midY: number,
  wallH: number,
  frontPanelSpan: number,
  frontPanelX: number,
  frontTopPanelH: number,
  frontTopPanelY: number,
  doorClearWidthM: number,
): THREE.BufferGeometry {
  const zSign = face === "n" ? 1 : -1;
  const z = zSign * (hz - wallT * 0.5);
  const g1 = new THREE.BoxGeometry(frontPanelSpan, wallH, wallT);
  g1.translate(frontPanelX, midY, z);
  const g2 = new THREE.BoxGeometry(frontPanelSpan, wallH, wallT);
  g2.translate(-frontPanelX, midY, z);
  const g3 = new THREE.BoxGeometry(doorClearWidthM, frontTopPanelH, wallT);
  g3.translate(0, frontTopPanelY, z);
  const merged = mergeGeometries([g1, g2, g3], false);
  if (!merged) throw new Error("buildMergedCabDoorSurroundGeometryNs: mergeGeometries failed");
  g1.dispose();
  g2.dispose();
  g3.dispose();
  applyMergedCabDoorWallInteriorPlanarUvs(merged, face);
  return merged;
}

function stdMatFromSlot(
  def: ElevatorCabDef | undefined,
  key: "wall" | "floor" | "door" | "ceiling" | "panel" | "button",
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

/** UserData on merged cab floor pick meshes (`body` + `label`) for nearest-level ray resolve. */
export const MAMMOTH_MERGED_CAB_FLOOR_PICK_UD = "mammothMergedCabFloorPickLayout" as const;

export type MergedCabFloorPickLayout = {
  /** Set by gameplay (`FpElevatorShaftVisual`) after cab build. */
  shaftKey?: string;
  maxLevel: number;
  vertsPerBodyLevel: number;
  vertsPerLabelLevel: number;
  /** Label centers in `panelRoot` local space (m). */
  centersPanelLocal: readonly { level: number; x: number; y: number; z: number }[];
};

export type ElevatorCabCarVisual = {
  root: THREE.Group;
  panelRoot: THREE.Group;
  doorL: THREE.Group | null;
  doorR: THREE.Group | null;
  floorButtons: ElevatorCabFloorButtonVisual[];
  /** When true, every `floorButtons[*].bodyMesh` shares one merged mesh (same for labels). */
  mergedFloorButtons?: boolean;
};

type BuildElevatorCabCarVisualArgs = {
  layout: ElevatorShaftLayout;
  def?: ElevatorCabDef;
  maxLevel?: number;
  floorLabelByLevel?: FloorShortLabelMap;
  /** Door opening fraction used for static previews or initial game state. */
  doorOpen01?: number;
  /** Editor cab authoring hides doors so transforms stay focused on authored shell/panel parts. */
  includeDoors?: boolean;
  /** Optional override for floor label faces (gameplay swaps highlight materials at runtime). */
  floorButtonLabelMaterial?: THREE.Material;
  rootName?: string;
  /**
   * Collapse per-floor button meshes into two merged draws (body + label atlas) for FP perf.
   * Picking uses {@link resolveMergedCabFloorPickLevel} + {@link MAMMOTH_MERGED_CAB_FLOOR_PICK_UD}.
   */
  mergeCabFloorButtons?: boolean;
  /**
   * Cab door clear width (m), including merged front surround header span and sliding leaves.
   * Defaults to `EXTERIOR_DOOR_W_M` so the opening matches the corridor landing swing.
   */
  doorClearWidthM?: number;
};

/**
 * Nearest label center in panel space — used when cab floor buttons are merged into one mesh pair.
 */
export function resolveMergedCabFloorPickLevel(
  hitPointWorld: THREE.Vector3,
  panelRoot: THREE.Object3D,
  layout: MergedCabFloorPickLayout,
): number {
  const p = new THREE.Vector3();
  panelRoot.worldToLocal(p.copy(hitPointWorld));
  let bestLevel = 1;
  let bestD = Infinity;
  for (const c of layout.centersPanelLocal) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dz = p.z - c.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      bestLevel = c.level;
    }
  }
  return bestLevel;
}

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
    floorT + 1.12 + Math.max(0, gridRows - 1) * (FLOOR_BTN_DIA + FLOOR_GAP) * 0.5;
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
    floorLabelByLevel,
    doorOpen01 = 0.5,
    includeDoors = true,
    floorButtonLabelMaterial,
    rootName = "editor_elevator_cab_preview",
    mergeCabFloorButtons = false,
    doorClearWidthM: doorClearWidthOpt,
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
  const clampedMaxLevel = Math.max(1, maxLevel);
  const atlasRows = Math.max(1, Math.ceil(clampedMaxLevel / FLOOR_ATLAS_COLS));
  const panelMat = stdMatFromSlot(def, "panel", 0xa13b3f);
  if (def?.materials?.panel?.roughness == null) panelMat.roughness = 0.46;
  if (def?.materials?.panel?.metalness == null) panelMat.metalness = 0.12;
  const buttonBodyMat = stdMatFromSlot(def, "button", 0xd7dbe2);
  if (def?.materials?.button?.roughness == null) buttonBodyMat.roughness = 0.34;
  if (def?.materials?.button?.metalness == null) buttonBodyMat.metalness = 0.28;
  const buttonMat =
    floorButtonLabelMaterial ??
    new THREE.MeshBasicMaterial({
      map: buildElevFloorAtlas(clampedMaxLevel, floorLabelByLevel),
      color: 0xffffff,
      side: THREE.DoubleSide,
    });

  const root = new THREE.Group();
  root.name = rootName;

  const floorT = 0.08;
  const wallT = 0.06;
  const doorClearRequested = doorClearWidthOpt ?? EXTERIOR_DOOR_W_M;
  const doorW = THREE.MathUtils.clamp(
    doorClearRequested,
    1.0,
    Math.max(1.05, 2 * Math.min(hx, hz) - wallT - 0.14),
  );
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
  const wallTopY = midY + wallH * 0.5;
  const doorTopY = floorT + 0.06 + DOOR_H;
  const frontTopPanelH = Math.max(0.12, wallTopY - doorTopY);
  const frontTopPanelY = wallTopY - frontTopPanelH * 0.5;
  const face = layout.doorFace;
  if (face === "e" || face === "w") {
    const xSign = face === "e" ? 1 : -1;
    const frontPanelSpan = Math.max(0.12, hz - doorW * 0.5);
    const frontPanelZ = doorW * 0.5 + frontPanelSpan * 0.5;
    addWall("cab_wall_back", wallT, wallH, hz * 2, -xSign * (hx - wallT * 0.5), midY, 0);
    addWall("cab_wall_side_n", hx * 2 - wallT * 2, wallH, wallT, 0, midY, hz - wallT * 0.5);
    addWall("cab_wall_side_s", hx * 2 - wallT * 2, wallH, wallT, 0, midY, -hz + wallT * 0.5);
    const doorSurroundGeom = buildMergedCabDoorSurroundGeometryEw(
      face,
      hx,
      wallT,
      midY,
      wallH,
      frontPanelSpan,
      frontPanelZ,
      frontTopPanelH,
      frontTopPanelY,
      doorW,
    );
    const doorSurround = new THREE.Mesh(doorSurroundGeom, wallMat);
    doorSurround.name = "cab_wall_front_surround";
    doorSurround.userData.editorCabPartId = "cab_wall_front_surround";
    root.add(doorSurround);
  } else {
    const zSign = face === "n" ? 1 : -1;
    const frontPanelSpan = Math.max(0.12, hx - doorW * 0.5);
    const frontPanelX = doorW * 0.5 + frontPanelSpan * 0.5;
    addWall("cab_wall_back", hx * 2, wallH, wallT, 0, midY, -zSign * (hz - wallT * 0.5));
    addWall("cab_wall_side_e", wallT, wallH, hz * 2 - wallT * 2, hx - wallT * 0.5, midY, 0);
    addWall("cab_wall_side_w", wallT, wallH, hz * 2 - wallT * 2, -hx + wallT * 0.5, midY, 0);
    const doorSurroundGeomNs = buildMergedCabDoorSurroundGeometryNs(
      face,
      hz,
      wallT,
      midY,
      wallH,
      frontPanelSpan,
      frontPanelX,
      frontTopPanelH,
      frontTopPanelY,
      doorW,
    );
    const doorSurroundNs = new THREE.Mesh(doorSurroundGeomNs, wallMat);
    doorSurroundNs.name = "cab_wall_front_surround";
    doorSurroundNs.userData.editorCabPartId = "cab_wall_front_surround";
    root.add(doorSurroundNs);
  }

  let doorL: THREE.Group | null = null;
  let doorR: THREE.Group | null = null;
  if (includeDoors) {
    doorL = new THREE.Group();
    doorR = new THREE.Group();
    const edge = CAB_DOOR_LEAF_OUTER_EDGE_EXTEND_M;
    const leafW = doorW * 0.5 - 0.02 + 2 * edge;
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
    const slide = THREE.MathUtils.lerp(-CAB_SLIDING_DOOR_CLOSED_OVERLAP_SLIDE_M, DOOR_SLIDE_M, doorOpen01);
    const tL = t.clone().multiplyScalar(-doorW * 0.25 - slide - edge);
    const tR = t.clone().multiplyScalar(doorW * 0.25 + slide + edge);
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
  const gridW = FLOOR_COLS * FLOOR_BTN_DIA + (FLOOR_COLS - 1) * FLOOR_GAP;
  const gridH = gridRows * FLOOR_BTN_DIA + Math.max(0, gridRows - 1) * FLOOR_GAP;
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
  const zSpan = (FLOOR_COLS - 1) * (FLOOR_BTN_DIA + FLOOR_GAP);
  const z0 = -zSpan * 0.5;
  const y0 = floorT + 1.12;
  const floorButtons: ElevatorCabFloorButtonVisual[] = [];

  if (mergeCabFloorButtons) {
    const bodies: THREE.Mesh[] = [];
    const labels: THREE.Mesh[] = [];
    for (let level = 1; level <= clampedMaxLevel; level++) {
      const idx = level - 1;
      const col = idx % FLOOR_COLS;
      const row = Math.floor(idx / FLOOR_COLS);
      const ly = y0 + row * (FLOOR_BTN_DIA + FLOOR_GAP);
      const gridAlong = z0 + col * (FLOOR_BTN_DIA + FLOOR_GAP);
      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(FLOOR_BTN_DIA * 0.5, FLOOR_BTN_DIA * 0.5, buttonDepth, 40),
        buttonBodyMat,
      );
      button.name = `cab_floor_button_body_${level}`;
      button.userData.editorCabPickId = "cab_floor_button";
      const facePlane = new THREE.Mesh(
        new THREE.CircleGeometry(FLOOR_BTN_FACE_DIA * 0.5, 40),
        buttonMat,
      );
      facePlane.userData.editorCabPickId = "cab_floor_button";
      applyAtlasUvToGeometry(facePlane.geometry, level, atlasRows);
      facePlane.name = `cab_floor_button_label_${level}`;
      const buttonFrontPad = 0.002;
      if (face === "e") {
        const wallX = -hx + wallT;
        button.rotation.z = Math.PI * 0.5;
        button.position.set(wallX + panelBoardDepth + buttonDepth * 0.5, ly, gridAlong);
        facePlane.position.set(wallX + panelBoardDepth + buttonDepth + buttonFrontPad, ly, gridAlong);
        facePlane.rotation.y = -Math.PI * 0.5;
      } else if (face === "w") {
        const wallX = hx - wallT;
        button.rotation.z = Math.PI * 0.5;
        button.position.set(wallX - panelBoardDepth - buttonDepth * 0.5, ly, gridAlong);
        facePlane.position.set(wallX - panelBoardDepth - buttonDepth - buttonFrontPad, ly, gridAlong);
        facePlane.rotation.y = Math.PI * 0.5;
      } else if (face === "n") {
        const wallZ = -hz + wallT;
        button.rotation.x = Math.PI * 0.5;
        button.position.set(gridAlong, ly, wallZ + panelBoardDepth + buttonDepth * 0.5);
        facePlane.position.set(gridAlong, ly, wallZ + panelBoardDepth + buttonDepth + buttonFrontPad);
      } else {
        const wallZ = hz - wallT;
        button.rotation.x = Math.PI * 0.5;
        button.position.set(gridAlong, ly, wallZ - panelBoardDepth - buttonDepth * 0.5);
        facePlane.position.set(gridAlong, ly, wallZ - panelBoardDepth - buttonDepth - buttonFrontPad);
        facePlane.rotation.y = Math.PI;
      }
      panelRoot.add(button);
      panelRoot.add(facePlane);
      bodies.push(button);
      labels.push(facePlane);
    }

    panelRoot.updateMatrixWorld(true);
    const invPanel = new THREE.Matrix4().copy(panelRoot.matrixWorld).invert();
    const toPanelLocal = (mesh: THREE.Mesh): THREE.BufferGeometry => {
      const g = mesh.geometry.clone();
      const m = new THREE.Matrix4().multiplyMatrices(invPanel, mesh.matrixWorld);
      g.applyMatrix4(m);
      return g;
    };

    const centersPanelLocal: { level: number; x: number; y: number; z: number }[] = [];
    const wp = new THREE.Vector3();
    const pl = new THREE.Vector3();
    for (let i = 0; i < labels.length; i++) {
      labels[i]!.getWorldPosition(wp);
      panelRoot.worldToLocal(pl.copy(wp));
      centersPanelLocal.push({
        level: i + 1,
        x: pl.x,
        y: pl.y,
        z: pl.z,
      });
    }

    const bp0 = bodies[0]!.geometry.getAttribute("position");
    const lp0 = labels[0]!.geometry.getAttribute("position");
    if (!bp0 || !lp0) {
      throw new Error("buildElevatorCabCarVisual: mergeCabFloorButtons missing position attribute");
    }
    const vertsPerBodyLevel = bp0.count;
    const vertsPerLabelLevel = lp0.count;

    const bodyGeos = bodies.map(toPanelLocal);
    const labelGeos = labels.map(toPanelLocal);
    for (const m of bodies) {
      panelRoot.remove(m);
      m.geometry.dispose();
    }
    for (const m of labels) {
      panelRoot.remove(m);
      m.geometry.dispose();
    }

    const mergedBodyGeom = mergeGeometries(bodyGeos, false);
    const mergedLabelGeom = mergeGeometries(labelGeos, false);
    for (const g of bodyGeos) g.dispose();
    for (const g of labelGeos) g.dispose();
    if (!mergedBodyGeom || !mergedLabelGeom) {
      throw new Error("buildElevatorCabCarVisual: mergeCabFloorButtons mergeGeometries failed");
    }
    mergedBodyGeom.computeBoundingSphere();
    mergedBodyGeom.computeBoundingBox();
    mergedLabelGeom.computeBoundingSphere();
    mergedLabelGeom.computeBoundingBox();

    const posB = mergedBodyGeom.getAttribute("position") as THREE.BufferAttribute | null;
    const posL = mergedLabelGeom.getAttribute("position") as THREE.BufferAttribute | null;
    if (!posB || !posL) {
      throw new Error("buildElevatorCabCarVisual: merged cab floor geom missing position");
    }
    const nBody = posB.count;
    const nLabel = posL.count;
    mergedBodyGeom.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(nBody * 3).fill(0.96), 3),
    );
    mergedLabelGeom.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(nLabel * 3).fill(0.88), 3),
    );

    const mergedBodyMat = buttonBodyMat.clone();
    mergedBodyMat.vertexColors = true;
    mergedBodyMat.name = "cab_floor_btn_body_merged_vc";

    const mergedLabelMat = buttonMat.clone();
    if (!(mergedLabelMat instanceof THREE.MeshBasicMaterial)) {
      throw new Error("buildElevatorCabCarVisual: mergeCabFloorButtons expects MeshBasic label material");
    }
    mergedLabelMat.vertexColors = true;
    mergedLabelMat.name = "cab_floor_btn_label_merged_vc";

    const mergedBody = new THREE.Mesh(mergedBodyGeom, mergedBodyMat);
    mergedBody.name = "cab_floor_button_bodies_merged";
    mergedBody.userData.editorCabPickId = "cab_floor_button";
    const mergedLabel = new THREE.Mesh(mergedLabelGeom, mergedLabelMat);
    mergedLabel.name = "cab_floor_button_labels_merged";
    mergedLabel.userData.editorCabPickId = "cab_floor_button";

    const pickLayout: MergedCabFloorPickLayout = {
      maxLevel: clampedMaxLevel,
      vertsPerBodyLevel,
      vertsPerLabelLevel,
      centersPanelLocal,
    };
    mergedBody.userData[MAMMOTH_MERGED_CAB_FLOOR_PICK_UD] = pickLayout;
    mergedLabel.userData[MAMMOTH_MERGED_CAB_FLOOR_PICK_UD] = pickLayout;

    panelRoot.add(mergedBody);
    panelRoot.add(mergedLabel);

    for (let level = 1; level <= clampedMaxLevel; level++) {
      floorButtons.push({ level, bodyMesh: mergedBody, labelMesh: mergedLabel });
    }
  } else {
    for (let level = 1; level <= clampedMaxLevel; level++) {
      const idx = level - 1;
      const col = idx % FLOOR_COLS;
      const row = Math.floor(idx / FLOOR_COLS);
      const ly = y0 + row * (FLOOR_BTN_DIA + FLOOR_GAP);
      const gridAlong = z0 + col * (FLOOR_BTN_DIA + FLOOR_GAP);
      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(FLOOR_BTN_DIA * 0.5, FLOOR_BTN_DIA * 0.5, buttonDepth, 40),
        buttonBodyMat,
      );
      button.name = `cab_floor_button_body_${level}`;
      button.userData.editorCabPickId = "cab_floor_button";
      const facePlane = new THREE.Mesh(
        new THREE.CircleGeometry(FLOOR_BTN_FACE_DIA * 0.5, 40),
        buttonMat,
      );
      facePlane.userData.editorCabPickId = "cab_floor_button";
      applyAtlasUvToGeometry(facePlane.geometry, level, atlasRows);
      facePlane.name = `cab_floor_button_label_${level}`;
      const buttonFrontPad = 0.002;
      if (face === "e") {
        const wallX = -hx + wallT;
        button.rotation.z = Math.PI * 0.5;
        button.position.set(wallX + panelBoardDepth + buttonDepth * 0.5, ly, gridAlong);
        facePlane.position.set(wallX + panelBoardDepth + buttonDepth + buttonFrontPad, ly, gridAlong);
        facePlane.rotation.y = -Math.PI * 0.5;
      } else if (face === "w") {
        const wallX = hx - wallT;
        button.rotation.z = Math.PI * 0.5;
        button.position.set(wallX - panelBoardDepth - buttonDepth * 0.5, ly, gridAlong);
        facePlane.position.set(wallX - panelBoardDepth - buttonDepth - buttonFrontPad, ly, gridAlong);
        facePlane.rotation.y = Math.PI * 0.5;
      } else if (face === "n") {
        const wallZ = -hz + wallT;
        button.rotation.x = Math.PI * 0.5;
        button.position.set(gridAlong, ly, wallZ + panelBoardDepth + buttonDepth * 0.5);
        facePlane.position.set(gridAlong, ly, wallZ + panelBoardDepth + buttonDepth + buttonFrontPad);
      } else {
        const wallZ = hz - wallT;
        button.rotation.x = Math.PI * 0.5;
        button.position.set(gridAlong, ly, wallZ - panelBoardDepth - buttonDepth * 0.5);
        facePlane.position.set(gridAlong, ly, wallZ - panelBoardDepth - buttonDepth - buttonFrontPad);
        facePlane.rotation.y = Math.PI;
      }
      panelRoot.add(button);
      panelRoot.add(facePlane);
      floorButtons.push({ level, bodyMesh: button, labelMesh: facePlane });
    }
  }
  root.add(panelRoot);

  applyElevatorCabPartTransforms(root, def);
  return {
    root,
    panelRoot,
    doorL,
    doorR,
    floorButtons,
    mergedFloorButtons: mergeCabFloorButtons ? true : undefined,
  };
}

/**
 * Editor/game-shared cab interior preview root.
 */
export function buildElevatorCabCarPreviewRoot(args: {
  layout: ElevatorShaftLayout;
  def?: ElevatorCabDef;
  maxLevel?: number;
  floorLabelByLevel?: FloorShortLabelMap;
  /** If true, doors are left at 50% open for framing. */
  previewDoorOpen01?: number;
  includeDoors?: boolean;
  doorClearWidthM?: number;
}): THREE.Group {
  return buildElevatorCabCarVisual({
    layout: args.layout,
    def: args.def,
    maxLevel: args.maxLevel,
    floorLabelByLevel: args.floorLabelByLevel,
    doorOpen01: args.previewDoorOpen01,
    includeDoors: args.includeDoors,
    doorClearWidthM: args.doorClearWidthM,
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

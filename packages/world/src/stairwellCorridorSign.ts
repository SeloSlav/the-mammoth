import * as THREE from "three";
import type { CardinalFace } from "./wallWithDoorCutout.js";
import { entryDoorYRangeForShell } from "./unitEntryAdjacency.js";

/** Room-local placement for a stairwell door sign cantilevered into the corridor. */
export type StairCorridorSignPlacement = {
  corridorWall: CardinalFace;
  /** Top of door opening (room-local Y). */
  yDoorTop: number;
  holeAlongZ: boolean;
  z0: number;
  z1: number;
  x0: number;
  x1: number;
};

const CANVAS_W = 1120;
const CANVAS_H = 280;
/** Scale applied inside `drawStairPictogram` (larger = bigger stair icon). */
const STAIR_PICTOGRAM_SCALE = 2.35;
/** “STEP” word size (px); keep within `CANVAS_H` minus border. */
const STEP_WORD_FONT_PX = 178;

function drawStairPictogram(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#1a1f26";
  const w = 52;
  const h = 56;
  const step = 14;
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, h * 0.42);
  ctx.lineTo(w * 0.5, h * 0.42);
  ctx.lineTo(w * 0.5, h * 0.42 - step);
  ctx.lineTo(-w * 0.5 + step * 2, h * 0.42 - step);
  ctx.lineTo(-w * 0.5 + step * 2, h * 0.42 - step * 2);
  ctx.lineTo(-w * 0.5 + step, h * 0.42 - step * 2);
  ctx.lineTo(-w * 0.5 + step, h * 0.42 - step * 3);
  ctx.lineTo(-w * 0.5, h * 0.42 - step * 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function createStairwellStepBoardMaterial(): THREE.MeshBasicMaterial | null {
  let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = CANVAS_W;
    c.height = CANVAS_H;
    canvas = c;
  } else if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(CANVAS_W, CANVAS_H);
  }
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx || !("fillRect" in ctx)) return null;

  ctx.fillStyle = "#f0eeea";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = "#2a3138";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, CANVAS_W - 8, CANVAS_H - 8);
  drawStairPictogram(ctx, CANVAS_W * 0.14, CANVAS_H * 0.5, STAIR_PICTOGRAM_SCALE);
  ctx.fillStyle = "#1a1f26";
  ctx.font = `800 ${STEP_WORD_FONT_PX}px system-ui, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("STEP", CANVAS_W * 0.56, CANVAS_H * 0.52);

  const tex = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  });
}

const grayFace = new THREE.MeshStandardMaterial({
  color: 0xd2d0cc,
  roughness: 0.88,
  metalness: 0.02,
});

const SIGN_H = 0.44;
/**
 * Gap from door opening top to the **bottom** edge of the STEP panel (m).
 * Same idea as the elevator corridor Koncar sign (`0.07` m gap in `floorPlaceholderMeshes.ts`);
 * slightly larger so the lintel
 * blade clears the frame. Must stay small — room-local Y is centered on the shell (`yHi` ≈ ~1.4 m
 * for a 3 m floor); values around **1 m** push the sign above the ceiling and it vanishes.
 */
const GAP_ABOVE_DOOR_OPENING_TO_PANEL_BOTTOM_M = 0.0;
/** Design basis before `LINTEL_LENGTH_SCALE` (lintel axis = local Z of the box). */
const LINTEL_LEN_MIN = 1.62;
const LINTEL_EXTRA_ON_OPENING = 1.02;
/** Corridor span of the STEP blade vs that basis (0.5 = half as long). */
const LINTEL_LENGTH_SCALE = 0.5;
/** Thin slab dimension before `rotation.y` (maps into wall-normal after +90°). */
const PROTRUSION = 0.18;
const PAD = 0.016;
/** Small lift so the lintel aligns with authored frame / swing-door head (m). */
const FRAME_HEAD_FUDGE = 0.08;
/** STEP boards sit slightly proud of the gray shell to avoid z-fighting (m). */
const BOARD_FACE_BUMP = 0.007;
/** Extra translation toward the corridor so the blade sits in the hall, not past the opening (m). */
const SIGN_SHIFT_INTO_CORRIDOR_M = 0.2;
/** Fraction of lintel length biased past the inner wall plane (along corridor normal). */
const SIGN_LINTEL_CENTER_BIAS = 0.34;

const _tmpQ = new THREE.Quaternion();
const _tmpS = new THREE.Vector3(1, 1, 1);
const _tmpP = new THREE.Vector3();

/** Same transform as a `Group` with `position` (px,py,pz) and `rotation.y = rotY`. */
function signRootMatrix(px: number, py: number, pz: number, rotY: number, out: THREE.Matrix4): void {
  _tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  _tmpP.set(px, py, pz);
  _tmpS.set(1, 1, 1);
  out.compose(_tmpP, _tmpQ, _tmpS);
}

function faceLocalMatrix(offsetX: number, rotYLocal: number, out: THREE.Matrix4): void {
  _tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotYLocal);
  _tmpP.set(offsetX, 0, 0);
  _tmpS.set(1, 1, 1);
  out.compose(_tmpP, _tmpQ, _tmpS);
}

function decomposeToObject3D(m: THREE.Matrix4, obj: THREE.Object3D): void {
  m.decompose(_tmpP, _tmpQ, _tmpS);
  obj.position.copy(_tmpP);
  obj.quaternion.copy(_tmpQ);
  obj.scale.copy(_tmpS);
}

const _mRoot = new THREE.Matrix4();
const _mFace = new THREE.Matrix4();
const _mWorld = new THREE.Matrix4();

/**
 * Same **box shell** size and **`rotation.y = ±π/2`** as before (do not change that pairing).
 * STEP uses **two `PlaneGeometry` meshes** with the same texture and **±π/2** local yaw so each
 * corridor side sees a front face (no mirrored box UVs).
 *
 * Each piece is a **direct child** of `group` with a **baked** transform (`root * face`), because
 * `mergeGroupDescendantsByMaterial` detaches `mammothSkipFloorGeometryMerge` meshes and drops
 * intermediate `Group` parents — nested hierarchies would lose placement.
 */
export function addStairwellCorridorSignMeshes(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  placements: readonly StairCorridorSignPlacement[],
): void {
  if (placements.length === 0) return;
  const stepMat = createStairwellStepBoardMaterial();
  const g = grayFace;
  const wt = 0.11;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const { yDoor1: shellDoorHeadY } = entryDoorYRangeForShell(sy);

  let meshIdx = 0;
  for (const pl of placements) {
    const doorSpan = pl.holeAlongZ
      ? Math.abs(pl.z1 - pl.z0)
      : Math.abs(pl.x1 - pl.x0);
    const lintelLen =
      LINTEL_LENGTH_SCALE *
      Math.max(LINTEL_LEN_MIN, doorSpan + LINTEL_EXTRA_ON_OPENING);
    const doorHeadY = Math.max(pl.yDoorTop, shellDoorHeadY) + FRAME_HEAD_FUDGE;
    const y = doorHeadY + GAP_ABOVE_DOOR_OPENING_TO_PANEL_BOTTOM_M + SIGN_H * 0.5;

    let px: number;
    const py = y;
    let pz: number;
    let rotY = 0;

    if (pl.corridorWall === "e") {
      px = hx - wt - lintelLen * SIGN_LINTEL_CENTER_BIAS - PAD - SIGN_SHIFT_INTO_CORRIDOR_M;
      pz = (pl.z0 + pl.z1) * 0.5;
      rotY = Math.PI * 0.5;
    } else if (pl.corridorWall === "w") {
      px = -hx + wt + lintelLen * SIGN_LINTEL_CENTER_BIAS + PAD + SIGN_SHIFT_INTO_CORRIDOR_M;
      pz = (pl.z0 + pl.z1) * 0.5;
      rotY = -Math.PI * 0.5;
    } else if (pl.corridorWall === "n") {
      px = (pl.x0 + pl.x1) * 0.5;
      pz = hz - wt - lintelLen * SIGN_LINTEL_CENTER_BIAS - PAD - SIGN_SHIFT_INTO_CORRIDOR_M;
      rotY = Math.PI * 0.5;
    } else {
      px = (pl.x0 + pl.x1) * 0.5;
      pz = -hz + wt + lintelLen * SIGN_LINTEL_CENTER_BIAS + PAD + SIGN_SHIFT_INTO_CORRIDOR_M;
      rotY = -Math.PI * 0.5;
    }

    const baseName = `stairwell_corridor_sign_${meshIdx++}`;
    signRootMatrix(px, py, pz, rotY, _mRoot);

    const shellGeo = new THREE.BoxGeometry(PROTRUSION, SIGN_H, lintelLen);
    /** One shared material — a 6-slot array would still issue six draws (one per box face group). */
    const shell = new THREE.Mesh(shellGeo, g);
    shell.name = `${baseName}_shell`;
    shell.userData.mammothNoCollision = true;
    shell.userData.mammothSkipFloorGeometryMerge = true;
    /**
     * STEP sign lintels hang into corridor airspace — strictly interior, fully occluded by the
     * opaque facade from any street-level view. Tag `mammothUnitInterior` so the session-level
     * exterior-view hide (see `mountFpSession` → `unitInteriorMeshes`) drops them together with
     * unit plaster / shaft / apartment-door interiors. Otherwise each sign (up to one per
     * stairwell × 19 storeys) is an always-rendered extra draw + blended board face.
     */
    shell.userData.mammothUnitInterior = true;
    decomposeToObject3D(_mRoot, shell);
    group.add(shell);

    if (stepMat) {
      const halfP = PROTRUSION * 0.5;
      const bump = BOARD_FACE_BUMP;

      const facePosX = new THREE.Mesh(new THREE.PlaneGeometry(lintelLen, SIGN_H), stepMat);
      facePosX.name = `${baseName}_board_px`;
      facePosX.userData.mammothNoCollision = true;
      facePosX.userData.mammothSkipFloorGeometryMerge = true;
      facePosX.userData.mammothUnitInterior = true;
      faceLocalMatrix(halfP + bump, Math.PI * 0.5, _mFace);
      _mWorld.multiplyMatrices(_mRoot, _mFace);
      decomposeToObject3D(_mWorld, facePosX);
      group.add(facePosX);

      const faceNegX = new THREE.Mesh(new THREE.PlaneGeometry(lintelLen, SIGN_H), stepMat);
      faceNegX.name = `${baseName}_board_nx`;
      faceNegX.userData.mammothNoCollision = true;
      faceNegX.userData.mammothSkipFloorGeometryMerge = true;
      faceNegX.userData.mammothUnitInterior = true;
      faceLocalMatrix(-halfP - bump, -Math.PI * 0.5, _mFace);
      _mWorld.multiplyMatrices(_mRoot, _mFace);
      decomposeToObject3D(_mWorld, faceNegX);
      group.add(faceNegX);
    }
  }
}

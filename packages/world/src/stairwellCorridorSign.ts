import * as THREE from "three";
import type { CardinalFace } from "./wallWithDoorCutout.js";
import { MAMMOTH_CORRIDOR_HALLWAY_SHELL_UD } from "./mammothMeshUserData.js";
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

const STEP_SIGN_FONT =
  '900 178px "Arial Narrow", "Franklin Gothic Medium", "Liberation Sans Narrow", Impact, sans-serif';

/** Late-socialist enamel board — dark institutional green, cream/rust frame, phosphor lettering. */
const STEP_BOARD = {
  base: "#0a2f2c",
  panel: "#0f3d38",
  panelHi: "#165449",
  frameOuter: "#c9b88a",
  frameInner: "#b85a2e",
  rivet: "#8a7a5c",
  neonCore: "#f2ffd4",
  neonGlow: "#6dffb0",
  pictogramCore: "#f8fff2",
  pictogramGlow: "#5ce8c8",
} as const;

type SignCanvasCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function acquireSignCanvas(
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  return null;
}

/** Subtle scuff/noise so the board reads as aged corridor enamel, not flat UI. */
function paintEnamelWear(
  ctx: SignCanvasCtx,
  width: number,
  height: number,
  seed: number,
): void {
  const n = Math.floor((width * height) / 900);
  for (let i = 0; i < n; i++) {
    const t = (seed + i * 7919) % 9973;
    const x = (t * 17) % width;
    const y = (t * 31) % height;
    const a = 0.02 + ((t * 7) % 100) / 2500;
    ctx.fillStyle = i % 3 === 0 ? `rgba(255, 248, 220, ${a})` : `rgba(0, 0, 0, ${a * 0.85})`;
    ctx.fillRect(x, y, 1 + (t % 2), 1);
  }
}

function paintStairwellStepBoardBackground(
  ctx: SignCanvasCtx,
  width: number,
  height: number,
): void {
  ctx.fillStyle = STEP_BOARD.base;
  ctx.fillRect(0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "rgba(0, 0, 0, 0.22)");
  grad.addColorStop(0.45, "rgba(255, 255, 255, 0.04)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.28)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const inset = 18;
  ctx.fillStyle = STEP_BOARD.panel;
  ctx.fillRect(inset, inset, width - inset * 2, height - inset * 2);
  const panelGrad = ctx.createLinearGradient(inset, inset, width - inset, height - inset);
  panelGrad.addColorStop(0, STEP_BOARD.panelHi);
  panelGrad.addColorStop(0.55, STEP_BOARD.panel);
  panelGrad.addColorStop(1, "#0a322e");
  ctx.fillStyle = panelGrad;
  ctx.fillRect(inset + 2, inset + 2, width - (inset + 2) * 2, height - (inset + 2) * 2);

  ctx.strokeStyle = STEP_BOARD.frameOuter;
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, width - 12, height - 12);
  ctx.strokeStyle = STEP_BOARD.frameInner;
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, width - 28, height - 28);

  const rivetR = 5;
  const rivetInset = 22;
  ctx.fillStyle = STEP_BOARD.rivet;
  for (const [rx, ry] of [
    [rivetInset, rivetInset],
    [width - rivetInset, rivetInset],
    [rivetInset, height - rivetInset],
    [width - rivetInset, height - rivetInset],
  ] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, rivetR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.arc(rx - 1.5, ry - 1.5, rivetR * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = STEP_BOARD.rivet;
  }

  paintEnamelWear(ctx, width, height, 41);
}

function drawNeonFillText(
  ctx: SignCanvasCtx,
  text: string,
  x: number,
  y: number,
  core: string,
  glow: string,
): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  ctx.shadowColor = glow;
  ctx.shadowBlur = 42;
  ctx.fillStyle = glow;
  ctx.globalAlpha = 0.55;
  ctx.fillText(text, x, y);

  ctx.shadowBlur = 22;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = core;
  ctx.fillText(text, x, y);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(10, 40, 36, 0.75)";
  ctx.lineWidth = 5;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = core;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawStairPictogram(
  ctx: SignCanvasCtx,
  cx: number,
  cy: number,
  scale: number,
): void {
  const w = 52;
  const h = 56;
  const step = 14;

  const trace = (): void => {
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
  };

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  ctx.shadowColor = STEP_BOARD.pictogramGlow;
  ctx.shadowBlur = 26;
  ctx.fillStyle = STEP_BOARD.pictogramGlow;
  ctx.globalAlpha = 0.5;
  trace();
  ctx.fill();

  ctx.shadowBlur = 12;
  ctx.globalAlpha = 1;
  ctx.fillStyle = STEP_BOARD.pictogramCore;
  trace();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(8, 36, 32, 0.65)";
  ctx.lineWidth = 2.5;
  trace();
  ctx.stroke();
  ctx.restore();
}

function paintStairwellStepBoard(
  ctx: SignCanvasCtx,
  width: number = CANVAS_W,
  height: number = CANVAS_H,
): void {
  paintStairwellStepBoardBackground(ctx, width, height);
  drawStairPictogram(ctx, width * 0.14, height * 0.5, STAIR_PICTOGRAM_SCALE);
  ctx.font = STEP_SIGN_FONT.replace("178px", `${STEP_WORD_FONT_PX}px`);
  drawNeonFillText(ctx, "STEP", width * 0.56, height * 0.52, STEP_BOARD.neonCore, STEP_BOARD.neonGlow);
}

function createStairwellStepBoardMaterial(): THREE.MeshBasicMaterial | null {
  const canvas = acquireSignCanvas(CANVAS_W, CANVAS_H);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx || !("fillRect" in ctx)) return null;

  paintStairwellStepBoard(ctx);

  const tex = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  return new THREE.MeshBasicMaterial({
    map: tex,
    /** Slight lift — corridor stairwells run very dark; BasicMaterial ignores scene lights. */
    color: new THREE.Color(1.14, 1.14, 1.06),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  });
}

/** Cast-iron lintel housing — dark enough to frame the phosphor board in dim corridors. */
const grayFace = new THREE.MeshStandardMaterial({
  color: 0x4a443c,
  roughness: 0.82,
  metalness: 0.14,
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
    shell.userData[MAMMOTH_CORRIDOR_HALLWAY_SHELL_UD] = true;
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
      facePosX.userData[MAMMOTH_CORRIDOR_HALLWAY_SHELL_UD] = true;
      faceLocalMatrix(halfP + bump, Math.PI * 0.5, _mFace);
      _mWorld.multiplyMatrices(_mRoot, _mFace);
      decomposeToObject3D(_mWorld, facePosX);
      group.add(facePosX);

      const faceNegX = new THREE.Mesh(new THREE.PlaneGeometry(lintelLen, SIGN_H), stepMat);
      faceNegX.name = `${baseName}_board_nx`;
      faceNegX.userData.mammothNoCollision = true;
      faceNegX.userData.mammothSkipFloorGeometryMerge = true;
      faceNegX.userData.mammothUnitInterior = true;
      faceNegX.userData[MAMMOTH_CORRIDOR_HALLWAY_SHELL_UD] = true;
      faceLocalMatrix(-halfP - bump, -Math.PI * 0.5, _mFace);
      _mWorld.multiplyMatrices(_mRoot, _mFace);
      decomposeToObject3D(_mWorld, faceNegX);
      group.add(faceNegX);
    }
  }
}

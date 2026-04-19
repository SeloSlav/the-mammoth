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

function createStairwellStepSignMaterialPair(): {
  a: THREE.MeshBasicMaterial;
  b: THREE.MeshBasicMaterial;
} | null {
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
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, CANVAS_W - 6, CANVAS_H - 6);
  drawStairPictogram(ctx, CANVAS_W * 0.16, CANVAS_H * 0.5, 1.12);
  ctx.fillStyle = "#1a1f26";
  ctx.font = '800 118px system-ui, "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("STEP", CANVAS_W * 0.58, CANVAS_H * 0.52);

  const baseTex = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
  baseTex.colorSpace = THREE.SRGBColorSpace;
  baseTex.needsUpdate = true;

  const flippedTex = baseTex.clone();
  flippedTex.wrapS = THREE.RepeatWrapping;
  flippedTex.repeat.x = -1;
  flippedTex.offset.x = 1;
  flippedTex.needsUpdate = true;

  const matOpts: THREE.MeshBasicMaterialParameters = {
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  };

  return {
    a: new THREE.MeshBasicMaterial({ map: baseTex, ...matOpts }),
    b: new THREE.MeshBasicMaterial({ map: flippedTex, ...matOpts }),
  };
}

const grayFace = new THREE.MeshStandardMaterial({
  color: 0xd2d0cc,
  roughness: 0.88,
  metalness: 0.02,
});

const SIGN_H = 0.44;
/** Gap from door head to bottom of lintel (m). */
const CLEARANCE_DOOR_TOP_TO_PANEL_BOTTOM = 1.02;
const LINTEL_LEN_MIN = 0.81;
const LINTEL_EXTRA_ON_OPENING = 0.51;
/** Thin slab dimension before `rotation.y` (maps into wall-normal after +90°). */
const PROTRUSION = 0.18;
const PAD = 0.016;
/** Extra lift above hinge math for frame / swing-door mesh (m). */
const FRAME_HEAD_FUDGE = 0.34;

/**
 * Three `BoxGeometry(width, height, depth)` puts the **largest ±z faces** (materials **4 / 5**)
 * in the **xy** plane with size **width × height**.
 *
 * Use **`BoxGeometry(lintelLen, SIGN_H, PROTRUSION)`** so STEP sits on **4 / 5** — the **long**
 * lintel × sign height boards (not the thin edge).
 *
 * **East / west:** `rotation.y = ±π/2` maps local **±z** normals to **world ±x** so those big
 * faces face along the hall; **depth** (local **z**) becomes the wall-normal protrusion.
 *
 * **North / south:** `rotation.y = 0` — lintel runs along **world x**, protrusion along **z**.
 */
export function addStairwellCorridorSignMeshes(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  placements: readonly StairCorridorSignPlacement[],
): void {
  if (placements.length === 0) return;
  const stepPair = createStairwellStepSignMaterialPair();
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
    const lintelLen = Math.max(LINTEL_LEN_MIN, doorSpan + LINTEL_EXTRA_ON_OPENING);
    const doorHeadY = Math.max(pl.yDoorTop, shellDoorHeadY) + FRAME_HEAD_FUDGE;
    const y = doorHeadY + CLEARANCE_DOOR_TOP_TO_PANEL_BOTTOM + SIGN_H * 0.5;

    let geo: THREE.BoxGeometry;
    let mats: THREE.Material[];
    let px: number;
    let py = y;
    let pz: number;
    let rotY = 0;

    if (pl.corridorWall === "e") {
      geo = new THREE.BoxGeometry(lintelLen, SIGN_H, PROTRUSION);
      mats = stepPair
        ? [g, g, g, g, stepPair.a, stepPair.b]
        : [g, g, g, g, g, g];
      px = hx - wt - PROTRUSION * 0.52 - PAD;
      pz = (pl.z0 + pl.z1) * 0.5;
      rotY = Math.PI * 0.5;
    } else if (pl.corridorWall === "w") {
      geo = new THREE.BoxGeometry(lintelLen, SIGN_H, PROTRUSION);
      mats = stepPair
        ? [g, g, g, g, stepPair.a, stepPair.b]
        : [g, g, g, g, g, g];
      px = -hx + wt + PROTRUSION * 0.52 + PAD;
      pz = (pl.z0 + pl.z1) * 0.5;
      rotY = -Math.PI * 0.5;
    } else if (pl.corridorWall === "n") {
      geo = new THREE.BoxGeometry(lintelLen, SIGN_H, PROTRUSION);
      mats = stepPair
        ? [g, g, g, g, stepPair.a, stepPair.b]
        : [g, g, g, g, g, g];
      px = (pl.x0 + pl.x1) * 0.5;
      pz = hz - wt - PROTRUSION * 0.52 - PAD;
      rotY = 0;
    } else {
      geo = new THREE.BoxGeometry(lintelLen, SIGN_H, PROTRUSION);
      mats = stepPair
        ? [g, g, g, g, stepPair.a, stepPair.b]
        : [g, g, g, g, g, g];
      px = (pl.x0 + pl.x1) * 0.5;
      pz = -hz + wt + PROTRUSION * 0.52 + PAD;
      rotY = 0;
    }

    const mesh = new THREE.Mesh(geo, mats);
    mesh.name = `stairwell_corridor_sign_${meshIdx++}`;
    mesh.position.set(px, py, pz);
    mesh.rotation.y = rotY;
    mesh.userData.mammothNoCollision = true;
    mesh.userData.mammothSkipFloorGeometryMerge = true;
    group.add(mesh);
  }
}

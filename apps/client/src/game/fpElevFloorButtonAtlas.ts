import * as THREE from "three";
import type { FloorShortLabelMap } from "@the-mammoth/world";
import { ATLAS_CELL_H, ATLAS_CELL_W, ATLAS_COLS } from "./fpElevatorConstants.js";
import { floorButtonLabel } from "./fpElevatorLabels.js";

function atlasRowsForMaxLevel(maxLevel: number): number {
  return Math.max(1, Math.ceil(Math.max(1, maxLevel) / ATLAS_COLS));
}

export function buildElevFloorAtlas(
  maxLevel: number,
  floorLabelByLevel?: FloorShortLabelMap,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  const atlasRows = atlasRowsForMaxLevel(maxLevel);
  c.width = ATLAS_COLS * ATLAS_CELL_W;
  c.height = atlasRows * ATLAS_CELL_H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas 2d");
  for (let level = 1; level <= maxLevel; level++) {
    const idx = level - 1;
    const col = idx % ATLAS_COLS;
    const row = Math.floor(idx / ATLAS_COLS);
    const x0 = col * ATLAS_CELL_W;
    const y0 = row * ATLAS_CELL_H;
    ctx.fillStyle = "#2a3138";
    ctx.fillRect(x0, y0, ATLAS_CELL_W, ATLAS_CELL_H);
    ctx.strokeStyle = "rgba(140, 200, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 2, y0 + 2, ATLAS_CELL_W - 4, ATLAS_CELL_H - 4);
    ctx.fillStyle = "#e4ecff";
    ctx.font = "700 19px system-ui,Segoe UI,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      floorButtonLabel(level, floorLabelByLevel),
      x0 + ATLAS_CELL_W * 0.5,
      y0 + ATLAS_CELL_H * 0.5,
    );
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function applyAtlasUvToPlaneGeometry(
  geom: THREE.PlaneGeometry,
  levelIndex1Based: number,
  maxLevel: number,
): void {
  const atlasRows = atlasRowsForMaxLevel(maxLevel);
  const idx = levelIndex1Based - 1;
  const col = idx % ATLAS_COLS;
  const row = Math.floor(idx / ATLAS_COLS);
  const u0 = col / ATLAS_COLS;
  const u1 = (col + 1) / ATLAS_COLS;
  const v1 = 1 - row / atlasRows;
  const v0 = 1 - (row + 1) / atlasRows;
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const uOld = uv.getX(i);
    const vOld = uv.getY(i);
    /** Horizontal mirror so glyphs match in-world (plane winding + wall yaw otherwise reverses them). */
    uv.setX(i, u1 - uOld * (u1 - u0));
    uv.setY(i, v0 + vOld * (v1 - v0));
  }
  uv.needsUpdate = true;
}

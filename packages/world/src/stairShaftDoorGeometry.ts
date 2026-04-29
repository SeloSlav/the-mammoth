import type { CardinalFace } from "./wallWithDoorCutout.js";

/**
 * Door opening span along the tangent axis in **shaft-local** coordinates.
 * Must stay in sync with {@link addShaftShell} hole clamping (`vlen*` / `zMinWall` / `xMinWall`).
 */
export function stairShaftDoorTangentSpanShaftLocal(
  sx: number,
  sz: number,
  doorFace: CardinalFace,
  tangentOffsetAlongWall: number,
  doorHalfW: number,
): { z0: number; z1: number } | { x0: number; x1: number } {
  const wt = 0.11;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  const zMin = -vlenZ * 0.5;
  const zMax = vlenZ * 0.5;
  const xMin = -vlenX * 0.5;
  const xMax = vlenX * 0.5;
  if (doorFace === "e" || doorFace === "w") {
    const z0 = Math.max(zMin, tangentOffsetAlongWall - doorHalfW);
    const z1 = Math.min(zMax, tangentOffsetAlongWall + doorHalfW);
    return { z0, z1 };
  }
  const x0 = Math.max(xMin, tangentOffsetAlongWall - doorHalfW);
  const x1 = Math.min(xMax, tangentOffsetAlongWall + doorHalfW);
  return { x0, x1 };
}

export function normalizeStairDoorVerticalSpan(
  yMin: number,
  yMax: number,
  rawY0: number,
  rawY1: number,
): { y0: number; y1: number } {
  let y0 = Math.max(yMin, Math.min(rawY0, rawY1));
  let y1 = Math.min(yMax, Math.max(rawY0, rawY1));
  if (y1 < y0 + 0.52) {
    const mid = (y0 + y1) * 0.5;
    y0 = Math.max(yMin, mid - 0.28);
    y1 = Math.min(yMax, mid + 0.28);
  }
  if (y0 > yMin) {
    const shiftDown = y0 - yMin;
    y0 = yMin;
    y1 = Math.max(y0 + 0.52, Math.min(yMax, y1 - shiftDown));
  }
  return { y0, y1 };
}

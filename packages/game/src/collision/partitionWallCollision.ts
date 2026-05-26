import type { OwnedApartmentWallOpening } from "@the-mammoth/schemas";
import { clampOwnedApartmentWallOpeningsForLength } from "./partitionWallOpenings.js";
import type { CollisionAabbLike } from "./combatSimArena.js";

export type PartitionWallWorldPose = {
  posX: number;
  posY: number;
  posZ: number;
  yawRad: number;
  pitchRad: number;
  rollRad?: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  openings?: readonly OwnedApartmentWallOpening[];
};

type LocalAabb = CollisionAabbLike;

type WallHoleXY = { x0: number; x1: number; y0: number; y1: number };

function mergeIntervals1D(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur[0] <= last[1] + 1e-4) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      out.push(cur);
    }
  }
  return out;
}

function localBoxAabb(
  sx: number,
  sy: number,
  sz: number,
  cx: number,
  cy: number,
  cz: number,
): LocalAabb {
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  return {
    min: [cx - hx, cy - hy, cz - hz],
    max: [cx + hx, cy + hy, cz + hz],
  };
}

/** Local-space collision slabs for a constant-Z holed partition wall (matches `addWallConstantZWithHoles`). */
export function partitionWallLocalSlabAabbs(
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  openings: readonly WallHoleXY[],
): LocalAabb[] {
  const xMin = -sizeX * 0.5;
  const xMax = sizeX * 0.5;
  const yLo = 0;
  const yHi = sizeY;
  const zCenter = 0;
  const thickness = sizeZ;

  if (openings.length === 0) {
    return [localBoxAabb(sizeX, sizeY, thickness, 0, sizeY * 0.5, zCenter)];
  }

  const ySplit = new Set<number>([yLo, yHi]);
  for (const h of openings) {
    ySplit.add(Math.max(yLo, Math.min(h.y0, h.y1)));
    ySplit.add(Math.min(yHi, Math.max(h.y0, h.y1)));
  }
  const yLevels = [...ySplit].sort((a, b) => a - b);
  const out: LocalAabb[] = [];

  for (let yi = 0; yi < yLevels.length - 1; yi++) {
    const y0 = yLevels[yi]!;
    const y1 = yLevels[yi + 1]!;
    if (y1 <= y0 + 1e-4) continue;

    const active = openings.filter(
      (h) => Math.min(h.y0, h.y1) < y1 - 1e-4 && Math.max(h.y0, h.y1) > y0 + 1e-4,
    );
    if (active.length === 0) {
      out.push(localBoxAabb(xMax - xMin, y1 - y0, thickness, 0, (y0 + y1) * 0.5, zCenter));
      continue;
    }

    const xIntervals: [number, number][] = [];
    for (const h of active) {
      const hx0 = Math.max(xMin, Math.min(h.x0, h.x1));
      const hx1 = Math.max(xMin, Math.max(h.x0, h.x1));
      if (hx1 > hx0 + 1e-4) xIntervals.push([hx0, hx1]);
    }
    const merged = mergeIntervals1D(xIntervals);

    let xCursor = xMin;
    for (const [hx0, hx1] of merged) {
      if (hx0 > xCursor + 1e-4) {
        out.push(
          localBoxAabb(
            hx0 - xCursor,
            y1 - y0,
            thickness,
            (xCursor + hx0) * 0.5,
            (y0 + y1) * 0.5,
            zCenter,
          ),
        );
      }
      xCursor = Math.max(xCursor, hx1);
    }
    if (xMax > xCursor + 1e-4) {
      out.push(
        localBoxAabb(
          xMax - xCursor,
          y1 - y0,
          thickness,
          (xCursor + xMax) * 0.5,
          (y0 + y1) * 0.5,
          zCenter,
        ),
      );
    }
  }

  return out;
}

/** Matches Three.js `Object3D.rotation.order = "YXZ"` (R = Ry * Rx * Rz). */
function transformPointYxz(
  x: number,
  y: number,
  z: number,
  posX: number,
  posY: number,
  posZ: number,
  yaw: number,
  pitch: number,
  roll: number,
): [number, number, number] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);

  const r00 = cy * cz + sy * sx * sz;
  const r01 = -cy * sz + sy * sx * cz;
  const r02 = sy * cx;
  const r10 = cx * sz;
  const r11 = cx * cz;
  const r12 = -sx;
  const r20 = -sy * cz + cy * sx * sz;
  const r21 = sy * sz + cy * sx * cz;
  const r22 = cy * cx;

  const wx = r00 * x + r01 * y + r02 * z;
  const wy = r10 * x + r11 * y + r12 * z;
  const wz = r20 * x + r21 * y + r22 * z;

  return [posX + wx, posY + wy, posZ + wz];
}

function transformLocalAabbToWorld(local: LocalAabb, pose: PartitionWallWorldPose): CollisionAabbLike {
  const roll = pose.rollRad ?? 0;
  const corners: [number, number, number][] = [];
  const [lx0, ly0, lz0] = local.min;
  const [lx1, ly1, lz1] = local.max;
  for (const x of [lx0, lx1]) {
    for (const y of [ly0, ly1]) {
      for (const z of [lz0, lz1]) {
        corners.push(
          transformPointYxz(
            x,
            y,
            z,
            pose.posX,
            pose.posY,
            pose.posZ,
            pose.yawRad,
            pose.pitchRad,
            roll,
          ),
        );
      }
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of corners) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function partitionWallOpeningToHoleXY(opening: OwnedApartmentWallOpening): WallHoleXY {
  const halfW = opening.widthM * 0.5;
  const halfH = opening.heightM * 0.5;
  return {
    x0: opening.tangentOffsetM - halfW,
    x1: opening.tangentOffsetM + halfW,
    y0: opening.centerYM - halfH,
    y1: opening.centerYM + halfH,
  };
}

/** Deterministic world AABBs for one authored interior partition wall. */
export function partitionWallWorldCollisionAabbs(pose: PartitionWallWorldPose): CollisionAabbLike[] {
  const openings = clampOwnedApartmentWallOpeningsForLength(
    pose.sizeX,
    pose.openings ?? [],
  ).map(partitionWallOpeningToHoleXY);
  const locals = partitionWallLocalSlabAabbs(pose.sizeX, pose.sizeY, pose.sizeZ, openings);
  return locals.map((local) => transformLocalAabbToWorld(local, pose));
}

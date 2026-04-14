import type { CollisionAabb } from "./collisionScene.js";

export type CollisionSpatialIndex = {
  visitAabbsInXZ(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb, index: number) => void,
  ): void;
};

/**
 * Uniform XZ grid for static collision solids. It deliberately indexes by XZ only because the
 * first-person controller is a vertical cylinder and most narrow-phase tests reject on Y quickly.
 */
export function buildCollisionSpatialIndex(
  aabbs: readonly CollisionAabb[],
  opts?: { targetCellsPerAxis?: number; minCellSizeM?: number },
): CollisionSpatialIndex {
  if (aabbs.length === 0) {
    return {
      visitAabbsInXZ: () => {},
    };
  }

  const target = Math.max(8, Math.min(96, opts?.targetCellsPerAxis ?? 48));
  const minCell = opts?.minCellSizeM ?? 3;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of aabbs) {
    minX = Math.min(minX, b.min[0]);
    maxX = Math.max(maxX, b.max[0]);
    minZ = Math.min(minZ, b.min[2]);
    maxZ = Math.max(maxZ, b.max[2]);
  }
  const pad = 0.5;
  minX -= pad;
  maxX += pad;
  minZ -= pad;
  maxZ += pad;

  const spanX = Math.max(maxX - minX, 1e-6);
  const spanZ = Math.max(maxZ - minZ, 1e-6);
  let cell = Math.max(minCell, spanX / target, spanZ / target);
  const nx = Math.max(1, Math.ceil(spanX / cell));
  const nz = Math.max(1, Math.ceil(spanZ / cell));
  cell = Math.max(minCell, Math.max(spanX / nx, spanZ / nz));

  const cellIndex = (ix: number, iz: number) => ix + iz * nx;
  const cells: number[][] = Array.from({ length: nx * nz }, () => []);

  for (let i = 0; i < aabbs.length; i++) {
    const b = aabbs[i]!;
    const ix0 = Math.max(0, Math.floor((b.min[0] - minX) / cell));
    const ix1 = Math.min(nx - 1, Math.floor((b.max[0] - minX) / cell));
    const iz0 = Math.max(0, Math.floor((b.min[2] - minZ) / cell));
    const iz1 = Math.min(nz - 1, Math.floor((b.max[2] - minZ) / cell));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        cells[cellIndex(ix, iz)]!.push(i);
      }
    }
  }

  return {
    visitAabbsInXZ(x0, x1, z0, z1, visit) {
      const ix0 = Math.max(0, Math.floor((x0 - minX) / cell));
      const ix1 = Math.min(nx - 1, Math.floor((x1 - minX) / cell));
      const iz0 = Math.max(0, Math.floor((z0 - minZ) / cell));
      const iz1 = Math.min(nz - 1, Math.floor((z1 - minZ) / cell));
      const seen = new Set<number>();
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const list = cells[cellIndex(ix, iz)]!;
          for (const i of list) {
            if (seen.has(i)) continue;
            seen.add(i);
            const b = aabbs[i]!;
            if (x1 < b.min[0] || x0 > b.max[0] || z1 < b.min[2] || z0 > b.max[2]) continue;
            visit(b, i);
          }
        }
      }
    },
  };
}

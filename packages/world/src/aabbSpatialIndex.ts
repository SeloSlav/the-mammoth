/**
 * Uniform XZ grid over axis-aligned boxes. Y is filtered during visits — same pattern as
 * {@link buildCollisionSpatialIndex} but accepts full 3D query windows for render culling.
 */

export type Aabb3 = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
};

export type AabbSpatialIndex = {
  visitInBox(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    visit: (index: number) => void,
  ): void;
  /** Six frustum planes `[nx, ny, nz, d]` where `dot(n, p) + d >= 0` means inside. */
  visitInFrustum(
    planes: readonly Readonly<[number, number, number, number]>[],
    visit: (index: number) => void,
  ): void;
};

function aabbIntersectsBox(
  b: Aabb3,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): boolean {
  return !(
    b.max[0] < x0 ||
    b.min[0] > x1 ||
    b.max[1] < y0 ||
    b.min[1] > y1 ||
    b.max[2] < z0 ||
    b.min[2] > z1
  );
}

/** Conservative frustum vs AABB — positive-vertex test per plane. */
export function aabbIntersectsFrustum(
  b: Aabb3,
  planes: readonly Readonly<[number, number, number, number]>[],
): boolean {
  for (let p = 0; p < planes.length; p++) {
    const plane = planes[p]!;
    const nx = plane[0];
    const ny = plane[1];
    const nz = plane[2];
    const d = plane[3];
    const px = nx >= 0 ? b.max[0] : b.min[0];
    const py = ny >= 0 ? b.max[1] : b.min[1];
    const pz = nz >= 0 ? b.max[2] : b.min[2];
    if (nx * px + ny * py + nz * pz + d < 0) return false;
  }
  return true;
}

export function buildAabbSpatialIndex(
  aabbs: readonly Aabb3[],
  opts?: { targetCellsPerAxis?: number; minCellSizeM?: number },
): AabbSpatialIndex {
  if (aabbs.length === 0) {
    return {
      visitInBox: () => {},
      visitInFrustum: () => {},
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

  const visitGen = new Uint32Array(aabbs.length);
  let generation = 0;

  const visitCells = (
    ix0: number,
    ix1: number,
    iz0: number,
    iz1: number,
    accept: (b: Aabb3, index: number) => boolean,
    visit: (index: number) => void,
  ): void => {
    if (++generation === 0) {
      generation = 1;
      visitGen.fill(0);
    }
    const gen = generation;
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const list = cells[cellIndex(ix, iz)]!;
        for (const i of list) {
          if (visitGen[i] === gen) continue;
          visitGen[i] = gen;
          if (accept(aabbs[i]!, i)) visit(i);
        }
      }
    }
  };

  return {
    visitInBox(x0, x1, y0, y1, z0, z1, visit) {
      const ix0 = Math.max(0, Math.floor((x0 - minX) / cell));
      const ix1 = Math.min(nx - 1, Math.floor((x1 - minX) / cell));
      const iz0 = Math.max(0, Math.floor((z0 - minZ) / cell));
      const iz1 = Math.min(nz - 1, Math.floor((z1 - minZ) / cell));
      visitCells(
        ix0,
        ix1,
        iz0,
        iz1,
        (b) => aabbIntersectsBox(b, x0, x1, y0, y1, z0, z1),
        visit,
      );
    },
    visitInFrustum(planes, visit) {
      if (planes.length < 6) return;
      visitCells(
        0,
        nx - 1,
        0,
        nz - 1,
        (b) => aabbIntersectsFrustum(b, planes),
        visit,
      );
    },
  };
}

import {
  WALK_FALLBACK_FLOOR_TOP_Y,
  type ExteriorWalkGroundOpts,
  type SampleWalkGroundOpts,
  type WalkSurfaceAabb,
  type WalkSurfaceXzFootprint,
} from "./walkSurfaceAABBs.js";

/** Sync with `FP_WALK_PROBE_DY` in `packages/engine/src/fpLocomotion.ts` and server `movement.rs`. */
const WALK_PROBE_DY_M = 1.05;

export type WalkSurfaceSpatialIndex = {
  readonly sampleTopY: (
    x: number,
    z: number,
    probeTopY: number,
    opts?: SampleWalkGroundOpts,
  ) => number;
  readonly sampleTopYWithExteriorGround: (
    x: number,
    z: number,
    probeTopY: number,
    xzFootprint: WalkSurfaceXzFootprint,
    opts?: SampleWalkGroundOpts & { exterior?: ExteriorWalkGroundOpts },
  ) => number;
};

function finalizeWalkTopY(best: number): number {
  if (!Number.isFinite(best)) return Number.NaN;
  return Math.max(best, WALK_FALLBACK_FLOOR_TOP_Y);
}

/**
 * Uniform XZ grid over walk AABBs. Queries collect indices from all cells overlapped by the
 * foot rectangle, then run the same max-top logic as `sampleWalkGroundTopY` on that subset.
 */
export function buildWalkSurfaceSpatialIndex(
  aabbs: readonly WalkSurfaceAabb[],
  opts?: { targetCellsPerAxis?: number; minCellSizeM?: number },
): WalkSurfaceSpatialIndex {
  if (aabbs.length === 0) {
    const sampleTopYEmpty = () => Number.NaN;
    return {
      sampleTopY: sampleTopYEmpty,
      sampleTopYWithExteriorGround: (
        x: number,
        z: number,
        probeTopY: number,
        xzFootprint: WalkSurfaceXzFootprint,
        o?: SampleWalkGroundOpts & { exterior?: ExteriorWalkGroundOpts },
      ) => {
        const inner = sampleTopYEmpty();
        if (Number.isFinite(inner)) return inner;
        const m = o?.exterior?.footprintMarginM ?? 2;
        const probeMax =
          o?.exterior?.exteriorProbeMaxY ?? WALK_FALLBACK_FLOOR_TOP_Y + 8;
        const { minX, maxX, minZ, maxZ } = xzFootprint;
        const outside =
          x < minX - m || x > maxX + m || z < minZ - m || z > maxZ + m;
        if (outside && probeTopY <= probeMax) return WALK_FALLBACK_FLOOR_TOP_Y;
        return Number.NaN;
      },
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

  const cells: number[][] = Array.from({ length: nx * nz }, () => []);

  const cellIndex = (ix: number, iz: number) => ix + iz * nx;

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

  // Generation-counter visited array — avoids creating a new Set on every sample call.
  // sampleSubsetRaw is called ~360 times/sec (2× per substep × 3 substeps × 60 fps);
  // allocating a Set each time was the primary cause of GC-driven frame spikes.
  const visitGen = new Uint32Array(aabbs.length);
  let sampleGeneration = 0;

  const sampleSubsetRaw = (
    x: number,
    z: number,
    probeTopY: number,
    footR: number,
    stepUpMargin: number,
  ): number => {
    const feetY = probeTopY - WALK_PROBE_DY_M;
    const fx0 = x - footR;
    const fx1 = x + footR;
    const fz0 = z - footR;
    const fz1 = z + footR;
    const ix0 = Math.max(0, Math.floor((fx0 - minX) / cell));
    const ix1 = Math.min(nx - 1, Math.floor((fx1 - minX) / cell));
    const iz0 = Math.max(0, Math.floor((fz0 - minZ) / cell));
    const iz1 = Math.min(nz - 1, Math.floor((fz1 - minZ) / cell));

    // Advance generation — wrapping at 2^32 is safe; would take >69 days at 360 calls/sec.
    if (++sampleGeneration === 0) {
      sampleGeneration = 1;
      visitGen.fill(0);
    }
    const gen = sampleGeneration;

    let best = NaN;
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const list = cells[cellIndex(ix, iz)]!;
        for (const j of list) {
          if (visitGen[j] === gen) continue;
          visitGen[j] = gen;
          const b = aabbs[j]!;
          if (fx1 < b.min[0] || fx0 > b.max[0] || fz1 < b.min[2] || fz0 > b.max[2]) continue;
          const top = b.max[1];
          if (top <= feetY + stepUpMargin) {
            best = Number.isFinite(best) ? Math.max(best, top) : top;
          }
        }
      }
    }
    return best;
  };

  const sampleTopY = (x: number, z: number, probeTopY: number, o?: SampleWalkGroundOpts) => {
    const stepUpMargin = o?.stepUpMargin ?? 0.82;
    const footR = o?.footRadiusXZ ?? 0.22;
    const best = sampleSubsetRaw(x, z, probeTopY, footR, stepUpMargin);
    return finalizeWalkTopY(best);
  };

  return {
    sampleTopY,
    sampleTopYWithExteriorGround: (
      x: number,
      z: number,
      probeTopY: number,
      xzFootprint: WalkSurfaceXzFootprint,
      o?: SampleWalkGroundOpts & { exterior?: ExteriorWalkGroundOpts },
    ) => {
      const inner = sampleTopY(x, z, probeTopY, o);
      if (Number.isFinite(inner)) return inner;

      const m = o?.exterior?.footprintMarginM ?? 2;
      const probeMax =
        o?.exterior?.exteriorProbeMaxY ?? WALK_FALLBACK_FLOOR_TOP_Y + 8;
      const { minX: fxMin, maxX: fxMax, minZ: fzMin, maxZ: fzMax } = xzFootprint;
      const outside =
        x < fxMin - m || x > fxMax + m || z < fzMin - m || z > fzMax + m;
      if (outside && probeTopY <= probeMax) return WALK_FALLBACK_FLOOR_TOP_Y;
      return Number.NaN;
    },
  };
}

import { describe, expect, it } from "vitest";
import {
  sampleWalkGroundTopY,
  sampleWalkGroundTopYWithExteriorGround,
  walkSurfaceAabbXZFootprint,
  type WalkSurfaceAabb,
} from "./walkSurfaceAABBs.js";
import { buildWalkSurfaceSpatialIndex } from "./walkSurfaceSpatialIndex.js";

function bruteTop(
  aabbs: readonly WalkSurfaceAabb[],
  x: number,
  z: number,
  probeTopY: number,
): number {
  return sampleWalkGroundTopY(aabbs, x, z, probeTopY);
}

describe("buildWalkSurfaceSpatialIndex", () => {
  it("matches brute-force sampleWalkGroundTopY on a scattered layout", () => {
    const aabbs: WalkSurfaceAabb[] = [];
    for (let i = 0; i < 40; i++) {
      const x0 = (i % 8) * 12 - 40;
      const z0 = Math.floor(i / 8) * 10 - 20;
      const yTop = 0.2 + i * 0.01;
      aabbs.push({
        min: [x0, 0, z0],
        max: [x0 + 4, yTop, z0 + 4],
      });
    }
    const idx = buildWalkSurfaceSpatialIndex(aabbs, { targetCellsPerAxis: 12 });
    for (let t = 0; t < 200; t++) {
      const x = (t * 0.37) % 55 - 28;
      const z = (t * 0.19) % 35 - 18;
      const probe = 2.5 + (t % 7) * 0.2;
      const a = idx.sampleTopY(x, z, probe);
      const b = bruteTop(aabbs, x, z, probe);
      if (Number.isNaN(a)) expect(Number.isNaN(b)).toBe(true);
      else expect(a).toBeCloseTo(b, 8);
    }
  });

  it("matches sampleWalkGroundTopYWithExteriorGround when outside hull", () => {
    const aabbs: WalkSurfaceAabb[] = [
      { min: [0, 0, 0], max: [2, 1.2, 2] },
      { min: [5, 0, 5], max: [7, 1.4, 7] },
    ];
    const fp = walkSurfaceAabbXZFootprint(aabbs)!;
    const idx = buildWalkSurfaceSpatialIndex(aabbs);
    const x = 200;
    const z = 200;
    const probe = 1.0;
    expect(idx.sampleTopYWithExteriorGround(x, z, probe, fp, {})).toBe(
      sampleWalkGroundTopYWithExteriorGround(aabbs, x, z, probe, fp, {}),
    );
  });

  it("does not let a higher overlapping slab win when only the lower one is step-up reachable from feet", () => {
    const aabbs: WalkSurfaceAabb[] = [
      { min: [0, 2.1, 0], max: [2, 2.336, 2] },
      { min: [0, 3.1, 0], max: [2, 3.348, 2] },
    ];
    const probeTopY = 3.386;
    expect(sampleWalkGroundTopY(aabbs, 1, 1, probeTopY)).toBeCloseTo(2.336, 6);

    const idx = buildWalkSurfaceSpatialIndex(aabbs);
    expect(idx.sampleTopY(1, 1, probeTopY)).toBeCloseTo(2.336, 6);
  });

  it("finds elevated landing tops while descending even when above step-up walk margin", () => {
    const aabbs: WalkSurfaceAabb[] = [
      { min: [0, 0.29, 0], max: [4, 0.4, 4] },
      { min: [0, 1.25, 0], max: [4, 1.36, 4] },
    ];
    const probeTopY = 1.55;
    expect(
      sampleWalkGroundTopY(aabbs, 2, 2, probeTopY, { descentProbe: true }),
    ).toBeCloseTo(1.36, 6);
    expect(sampleWalkGroundTopY(aabbs, 2, 2, probeTopY)).toBeCloseTo(0.4, 6);

    const idx = buildWalkSurfaceSpatialIndex(aabbs);
    expect(
      idx.sampleTopY(2, 2, probeTopY, { descentProbe: true }),
    ).toBeCloseTo(1.36, 6);
  });
});

import { describe, expect, it } from "vitest";
import {
  worldSoundAxisWeightedDistanceM,
  worldSoundEuclideanDistanceM,
  worldSoundVirtualPannerPosition,
} from "./worldProximityMetric.js";

describe("worldProximityMetric", () => {
  it("matches Euclidean distance when axisWeightY is 1", () => {
    const lx = 1;
    const ly = 2;
    const lz = 3;
    const sx = 4;
    const sy = 6;
    const sz = 8;
    const eu = worldSoundEuclideanDistanceM(lx, ly, lz, sx, sy, sz);
    expect(worldSoundAxisWeightedDistanceM(lx, ly, lz, sx, sy, sz, 1)).toBeCloseTo(eu, 6);
  });

  it("weights vertical separation more than horizontal", () => {
    // 4 m straight up, weight 2 → effective 8 m; 4 m horizontal would stay 4 m effective
    expect(worldSoundAxisWeightedDistanceM(0, 0, 0, 0, 4, 0, 2)).toBeCloseTo(8, 6);
    expect(worldSoundAxisWeightedDistanceM(0, 0, 0, 4, 0, 0, 2)).toBeCloseTo(4, 6);
  });

  it("virtual panner lies on listener→source ray with length effectiveM", () => {
    const lx = 0;
    const ly = 0;
    const lz = 0;
    const sx = 0;
    const sy = 3;
    const sz = 0;
    const effective = 9;
    const p = worldSoundVirtualPannerPosition(lx, ly, lz, sx, sy, sz, effective);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(9, 6);
    const d = Math.hypot(p.x - lx, p.y - ly, p.z - lz);
    expect(d).toBeCloseTo(effective, 6);
  });
});

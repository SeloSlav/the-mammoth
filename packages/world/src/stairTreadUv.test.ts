import { describe, expect, it } from "vitest";
import { createStairTreadBoxGeometry, STAIR_TREAD_UV_METERS_PER_TILE } from "./stairTreadUv.js";

describe("createStairTreadBoxGeometry", () => {
  it("assigns metric UVs so the top face spans multiple repeats on a wide tread", () => {
    const halfAlong = 0.35;
    const riseHalf = 0.085;
    const halfAcross = 0.12;
    const g = createStairTreadBoxGeometry(halfAlong, riseHalf, halfAcross);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    expect(uv).toBeDefined();
    expect(uv!.count).toBe(pos.count);

    const hw = halfAlong;
    const hd = halfAcross;
    let maxVAlongRun = -Infinity;
    let minVAlongRun = Infinity;
    for (let vi = 0; vi < pos.count; vi += 3) {
      const x0 = pos.getX(vi);
      const y0 = pos.getY(vi);
      const z0 = pos.getZ(vi);
      const x1 = pos.getX(vi + 1);
      const y1 = pos.getY(vi + 1);
      const z1 = pos.getZ(vi + 1);
      const x2 = pos.getX(vi + 2);
      const y2 = pos.getY(vi + 2);
      const z2 = pos.getZ(vi + 2);
      const e1x = x1 - x0;
      const e1y = y1 - y0;
      const e1z = z1 - z0;
      const e2x = x2 - x0;
      const e2y = y2 - y0;
      const e2z = z2 - z0;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const absx = Math.abs(nx);
      const absy = Math.abs(ny);
      const absz = Math.abs(nz);
      const isTop = absy >= absx && absy >= absz && ny > 0;
      if (!isTop) continue;
      for (const i of [vi, vi + 1, vi + 2]) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const u = uv!.getX(i);
        const v = uv!.getY(i);
        expect(u).toBeCloseTo((z + hd) / STAIR_TREAD_UV_METERS_PER_TILE, 5);
        expect(v).toBeCloseTo((x + hw) / STAIR_TREAD_UV_METERS_PER_TILE, 5);
        maxVAlongRun = Math.max(maxVAlongRun, v);
        minVAlongRun = Math.min(minVAlongRun, v);
      }
    }
    /** Along-run span on the top face = (2 * halfAlong) / metersPerTile (often less than one repeat). */
    const expectedRunSpan = (2 * halfAlong) / STAIR_TREAD_UV_METERS_PER_TILE;
    expect(maxVAlongRun - minVAlongRun).toBeCloseTo(expectedRunSpan, 5);
    g.dispose();
  });
});

import { describe, expect, it } from "vitest";
import {
  computeSwitchbackStairLayout,
  GROUND_STOREY_EXTRA_BOTTOM_TREADS,
} from "./stairWellGeometry.js";

describe("computeSwitchbackStairLayout", () => {
  it("ground-storey extras extend vertical reach (same riser, lower start)", () => {
    const sx = 8.35;
    const sy = 3.1578947368421053;
    const sz = 13.95;
    const typical = computeSwitchbackStairLayout(sx, sy, sz);
    const ground = computeSwitchbackStairLayout(sx, sy, sz, {
      extraBottomTreads: GROUND_STOREY_EXTRA_BOTTOM_TREADS,
    });
    const sum = (c: readonly number[]) => c.reduce((a, b) => a + b, 0);
    expect(typical.legTreadCounts).toEqual([0, 10, 0, 8]);
    expect(ground.legTreadCounts).toEqual([0, 11, 0, 9]);
    expect(sum(ground.legTreadCounts)).toBe(
      sum(typical.legTreadCounts) + GROUND_STOREY_EXTRA_BOTTOM_TREADS,
    );
    const minY = (treads: readonly { y: number }[]) =>
      Math.min(...treads.map((t) => t.y));
    expect(minY(ground.treads)).toBeLessThan(minY(typical.treads));
    const dyTyp =
      typical.treads.length > 1 ? typical.treads[1]!.y - typical.treads[0]!.y : 0;
    const dyGr =
      ground.treads.length > 1 ? ground.treads[1]!.y - ground.treads[0]!.y : 0;
    expect(dyGr).toBeCloseTo(dyTyp, 5);
  });
});

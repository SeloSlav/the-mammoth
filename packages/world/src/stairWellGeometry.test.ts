import { describe, expect, it } from "vitest";
import {
  computeSwitchbackStairLayout,
  GROUND_STOREY_EXTRA_BOTTOM_TREADS,
} from "./stairWellGeometry.js";

describe("computeSwitchbackStairLayout", () => {
  it("adds ground-storey extras on the bottom run (Mamutica hub: east 10 → 13)", () => {
    const sx = 8.35;
    const sy = 3.1578947368421053;
    const sz = 13.95;
    const typical = computeSwitchbackStairLayout(sx, sy, sz);
    const ground = computeSwitchbackStairLayout(sx, sy, sz, {
      extraBottomTreads: GROUND_STOREY_EXTRA_BOTTOM_TREADS,
    });
    const sum = (c: readonly number[]) => c.reduce((a, b) => a + b, 0);
    expect(typical.legTreadCounts).toEqual([0, 10, 0, 8]);
    expect(ground.legTreadCounts).toEqual([0, 13, 0, 8]);
    expect(sum(ground.legTreadCounts)).toBe(
      sum(typical.legTreadCounts) + GROUND_STOREY_EXTRA_BOTTOM_TREADS,
    );
    const dyTyp =
      typical.treads.length > 1 ? typical.treads[1]!.y - typical.treads[0]!.y : 0;
    const dyGr =
      ground.treads.length > 1 ? ground.treads[1]!.y - ground.treads[0]!.y : 0;
    expect(Math.abs(dyGr)).toBeLessThan(Math.abs(dyTyp));
  });
});

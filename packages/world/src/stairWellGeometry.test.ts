import { describe, expect, it } from "vitest";
import { computeSwitchbackStairLayout } from "./stairWellGeometry.js";

describe("computeSwitchbackStairLayout", () => {
  it("adds one bottom tread for ground-storey segments without changing lap vertical span", () => {
    const sx = 8.35;
    const sy = 3.1578947368421053;
    const sz = 13.95;
    const typical = computeSwitchbackStairLayout(sx, sy, sz);
    const ground = computeSwitchbackStairLayout(sx, sy, sz, { extraBottomTreads: 1 });
    const sum = (c: readonly number[]) => c.reduce((a, b) => a + b, 0);
    expect(sum(ground.legTreadCounts)).toBe(sum(typical.legTreadCounts) + 1);
    expect(ground.treads.length).toBe(typical.treads.length + 1);
    const dyTyp =
      typical.treads.length > 1 ? typical.treads[1]!.y - typical.treads[0]!.y : 0;
    const dyGr =
      ground.treads.length > 1 ? ground.treads[1]!.y - ground.treads[0]!.y : 0;
    expect(Math.abs(dyGr)).toBeLessThan(Math.abs(dyTyp));
  });
});

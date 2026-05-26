import { describe, expect, it } from "vitest";
import {
  applyGpuRevealBudget,
  createGpuRevealSchedulerState,
} from "./gpuRevealScheduler.js";

describe("applyGpuRevealBudget", () => {
  it("caps steady-state reveals per frame", () => {
    const state = createGpuRevealSchedulerState<string>();
    const visible: string[] = [];
    const items = ["a", "b", "c"].map((key) => ({
      key,
      desiredVisible: true,
      priority: 1,
      setVisible: (v: boolean) => {
        if (v) visible.push(key);
      },
    }));
    for (const key of ["a", "b", "c"]) state.warmedKeys.add(key);
    applyGpuRevealBudget(items, state, "steady", { warmupMax: 32, steadyMax: 1 });
    expect(visible.length).toBe(1);
  });
});

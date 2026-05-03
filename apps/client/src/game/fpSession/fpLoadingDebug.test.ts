import { describe, expect, it } from "vitest";
import {
  fpLoadingDbgInferTimedStartsForPerfWindow,
  fpLoadingDbgExplainPerfInterval,
  fpLoadingDbgStallMarksSummary,
} from "./fpLoadingDebug.js";

describe("fpLoadingDbgStallMarksSummary", () => {
  it("captures milestones inside inclusive window order", () => {
    const ring = [
      { at: 95, label: "A" },
      { at: 100, label: "B" },
      { at: 150, label: "C" },
      { at: 200, label: "D" },
    ];
    const s = fpLoadingDbgStallMarksSummary(98, 160, ring);
    expect(s.marksInWindow).toContain("B[+2ms]");
    expect(s.marksInWindow).toContain("C[+52ms]");
    expect(s.lastMarkBefore).toContain("A");
  });
});

describe("fpLoadingDbgExplainPerfInterval", () => {
  it("joins phase with stall summary", () => {
    const ring = [{ at: 105, label: "X" }];
    const line = fpLoadingDbgExplainPerfInterval(100, 110, ring, ["a", "b"]);
    expect(line).toContain("phase=a>b");
    expect(line).toContain("X[+5ms]");
  });
});

describe("fpLoadingDbgInferTimedStartsForPerfWindow", () => {
  it("parses Timed:start lines with appended JSON-ish suffix", () => {
    const ring = [
      { at: 10, label: `fp_static_world_create:start {\"k\":1}` },
      { at: 50, label: `webgpu_renderer_init:start` },
      { at: 80, label: `webgpu_renderer_init:done {\"elapsedMs\":99}` },
    ];
    const t0 = 40;
    const t1 = 90;
    const inf = fpLoadingDbgInferTimedStartsForPerfWindow(t0, t1, ring);
    expect(inf).toContain("timedStartInsideWindow=webgpu_renderer_init");
    expect(inf).toContain("lastTimedStartBefore=fp_static_world_create");
  });
});

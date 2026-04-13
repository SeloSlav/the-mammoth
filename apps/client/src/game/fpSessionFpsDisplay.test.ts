import { describe, expect, it } from "vitest";
import {
  initialFpSessionFpsAccum,
  reduceFpSessionFpsAccum,
} from "./fpSessionFpsDisplay";

describe("reduceFpSessionFpsAccum", () => {
  it("seeds the window on first sample", () => {
    const a0 = initialFpSessionFpsAccum();
    const a1 = reduceFpSessionFpsAccum(a0, 1000);
    expect(a1.windowStartMs).toBe(1000);
    expect(a1.framesInWindow).toBe(1);
    expect(a1.displayedRounded).toBe(null);
  });

  it("publishes rounded fps after the window elapses", () => {
    let acc = initialFpSessionFpsAccum();
    acc = reduceFpSessionFpsAccum(acc, 0);
    const n = 30;
    for (let i = 1; i < n; i += 1) {
      const t = (i * 500) / (n - 1);
      acc = reduceFpSessionFpsAccum(acc, t);
    }
    expect(acc.displayedRounded).toBe(60);
    expect(acc.framesInWindow).toBe(1);
    expect(acc.windowStartMs).toBe(500);
  });
});

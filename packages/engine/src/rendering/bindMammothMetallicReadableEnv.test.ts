import { describe, expect, it } from "vitest";
import { mammothSpecularReadabilityWeight } from "./bindMammothMetallicReadableEnv.js";

describe("mammothSpecularReadabilityWeight", () => {
  it("rises with metalness and falls with roughness", () => {
    const glossy = mammothSpecularReadabilityWeight(0.9, 0.08);
    const matte = mammothSpecularReadabilityWeight(0.9, 0.92);
    const nonMetal = mammothSpecularReadabilityWeight(0.02, 0.08);
    expect(glossy).toBeGreaterThan(matte);
    expect(glossy).toBeGreaterThan(nonMetal);
  });

  it("clamps pathological exporter values", () => {
    expect(mammothSpecularReadabilityWeight(-1, 999)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(mammothSpecularReadabilityWeight(Number.NaN, 0))).toBe(false);
    expect(Number.isFinite(mammothSpecularReadabilityWeight(0.5, Number.NaN))).toBe(false);
  });
});

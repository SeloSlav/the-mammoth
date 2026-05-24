import { describe, expect, it } from "vitest";
import { computePlayerDamageTraumaAdd } from "./fpPlayerDamageScreenShake.js";

describe("computePlayerDamageTraumaAdd", () => {
  it("scales with damage and caps at 1", () => {
    expect(computePlayerDamageTraumaAdd(14)).toBeCloseTo(0.28 + 14 / 38, 5);
    expect(computePlayerDamageTraumaAdd(40)).toBeCloseTo(1, 5);
    expect(computePlayerDamageTraumaAdd(200)).toBe(1);
  });
});

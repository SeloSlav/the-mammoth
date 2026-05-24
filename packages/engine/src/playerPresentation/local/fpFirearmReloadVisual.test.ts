import { describe, expect, it } from "vitest";
import {
  FP_FIREARM_RELOAD_KNOCK_PEAK_FRAC,
  FP_FIREARM_RELOAD_PITCH_MAX_RAD,
  knockWave01,
  sampleFpFirearmReloadVisual,
} from "./fpFirearmReloadVisual.js";

describe("knockWave01", () => {
  it("peaks quickly then settles", () => {
    expect(knockWave01(0)).toBe(0);
    expect(knockWave01(FP_FIREARM_RELOAD_KNOCK_PEAK_FRAC)).toBeCloseTo(1, 5);
    expect(knockWave01(1)).toBeCloseTo(0, 5);
  });
});

describe("sampleFpFirearmReloadVisual", () => {
  it("knocks once per round slice", () => {
    const rounds = 4;
    const slice = 1 / rounds;
    expect(sampleFpFirearmReloadVisual(0, rounds).rotationRad.x).toBe(0);
    expect(sampleFpFirearmReloadVisual(slice * FP_FIREARM_RELOAD_KNOCK_PEAK_FRAC * 0.5, rounds).rotationRad.x).toBeGreaterThan(0);
    expect(sampleFpFirearmReloadVisual(slice * FP_FIREARM_RELOAD_KNOCK_PEAK_FRAC, rounds).rotationRad.x).toBeCloseTo(
      FP_FIREARM_RELOAD_PITCH_MAX_RAD,
      5,
    );
    expect(sampleFpFirearmReloadVisual(slice, rounds).rotationRad.x).toBeCloseTo(0, 5);
    expect(sampleFpFirearmReloadVisual(1, rounds).rotationRad.x).toBeCloseTo(0, 5);
  });

  it("single shell gets one full knock cycle", () => {
    expect(sampleFpFirearmReloadVisual(FP_FIREARM_RELOAD_KNOCK_PEAK_FRAC, 1).rotationRad.x).toBeCloseTo(
      FP_FIREARM_RELOAD_PITCH_MAX_RAD,
      5,
    );
  });
});

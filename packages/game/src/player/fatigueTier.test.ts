import { describe, expect, it } from "vitest";
import {
  deriveFatigueSprintSpeedMul,
  deriveFatigueTier,
  fatigueSprintSpeedMul,
} from "./fatigueTier.js";

describe("fatigueTier", () => {
  it("derives tier from time of day", () => {
    expect(deriveFatigueTier({ timeOfDayMinutes: 400, sleepPressure: 0, stimulantLoad: 0 })).toBe(
      "none",
    );
    expect(deriveFatigueTier({ timeOfDayMinutes: 1300, sleepPressure: 0, stimulantLoad: 0 })).toBe(
      "soft",
    );
    expect(deriveFatigueTier({ timeOfDayMinutes: 60, sleepPressure: 0, stimulantLoad: 0 })).toBe(
      "severe",
    );
  });

  it("softens tier under stimulant load", () => {
    expect(
      deriveFatigueTier({ timeOfDayMinutes: 1300, sleepPressure: 0, stimulantLoad: 0.4 }),
    ).toBe("none");
  });

  it("reduces sprint speed when fatigued", () => {
    expect(fatigueSprintSpeedMul("none")).toBe(1);
    expect(fatigueSprintSpeedMul("collapse")).toBeLessThan(0.85);
    expect(
      deriveFatigueSprintSpeedMul({ timeOfDayMinutes: 180, sleepPressure: 0, stimulantLoad: 0 }),
    ).toBeLessThan(1);
  });
});

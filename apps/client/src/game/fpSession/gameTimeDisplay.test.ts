import { describe, expect, it, beforeEach } from "vitest";
import {
  displayGameClock,
  gameMinutesPerServerTick,
  interpolatedGameTimeMinutes,
  resetGameTimeDisplayForTests,
  syncGameTimeFromServer,
} from "./gameTimeDisplay.js";

describe("gameTimeDisplay", () => {
  beforeEach(() => {
    resetGameTimeDisplayForTests();
  });

  it("interpolates between server syncs", () => {
    syncGameTimeFromServer({ timeOfDayMinutes: 360, sleepsCount: 0 });
    const t0 = interpolatedGameTimeMinutes(1000);
    const t1 = interpolatedGameTimeMinutes(3000);
    expect(t1).toBeGreaterThan(t0);
  });

  it("formats day and clock", () => {
    syncGameTimeFromServer({ timeOfDayMinutes: 520, sleepsCount: 6 });
    expect(displayGameClock(0)).toEqual({ day: 7, hhmm: "08:40" });
  });

  it("matches server tick pacing constant", () => {
    expect(gameMinutesPerServerTick()).toBeCloseTo(0.5);
  });

  it("never jumps backward on routine server syncs", () => {
    syncGameTimeFromServer({ timeOfDayMinutes: 360, sleepsCount: 0 }, 0);
    const displayed = interpolatedGameTimeMinutes(60_000);
    expect(displayed).toBeGreaterThan(360);
    syncGameTimeFromServer({ timeOfDayMinutes: 360, sleepsCount: 0 }, 60_000);
    expect(interpolatedGameTimeMinutes(120_000)).toBeGreaterThanOrEqual(displayed);
  });
});

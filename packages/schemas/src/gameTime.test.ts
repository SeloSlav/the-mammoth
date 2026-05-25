import { describe, expect, it } from "vitest";
import {
  displayDayNumber,
  formatGameTimeHhMm,
  GAME_MINUTES_PER_TICK,
  GAME_SECONDS_PER_REAL_SECOND,
  GAME_TIME_TICK_INTERVAL_SECS,
  HARD_COLLAPSE_TIME_MINUTES,
  isAfterMidnight,
  WAKE_TIME_MINUTES,
} from "./gameTime.js";

describe("gameTime", () => {
  it("formats 24h clock", () => {
    expect(formatGameTimeHhMm(0)).toBe("00:00");
    expect(formatGameTimeHhMm(WAKE_TIME_MINUTES)).toBe("06:00");
    expect(formatGameTimeHhMm(210)).toBe("03:30");
    expect(formatGameTimeHhMm(520)).toBe("08:40");
  });

  it("detects after-midnight window", () => {
    expect(isAfterMidnight(0)).toBe(true);
    expect(isAfterMidnight(HARD_COLLAPSE_TIME_MINUTES)).toBe(true);
    expect(isAfterMidnight(WAKE_TIME_MINUTES - 1)).toBe(true);
    expect(isAfterMidnight(WAKE_TIME_MINUTES)).toBe(false);
    expect(isAfterMidnight(1260)).toBe(false);
  });

  it("derives display day from sleeps count", () => {
    expect(displayDayNumber(0)).toBe(1);
    expect(displayDayNumber(6)).toBe(7);
  });

  it("matches pacing constants", () => {
    expect(GAME_SECONDS_PER_REAL_SECOND).toBe(30);
    expect(GAME_MINUTES_PER_TICK).toBeCloseTo(0.5);
    expect(GAME_TIME_TICK_INTERVAL_SECS).toBe(1);
  });
});

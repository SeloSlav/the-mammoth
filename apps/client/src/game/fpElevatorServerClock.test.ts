import { describe, expect, it } from "vitest";
import { createFpElevatorServerClock } from "./fpElevatorServerClock.js";

describe("createFpElevatorServerClock", () => {
  it("returns identity mapping before any samples arrive", () => {
    const clock = createFpElevatorServerClock();
    expect(clock.hasEstimate()).toBe(false);
    expect(clock.estimatedOffsetMs()).toBe(0);
    expect(clock.estimatedServerEpochMs(12_345)).toBe(12_345);
  });

  it("captures the initial clock offset on the first observation", () => {
    const clock = createFpElevatorServerClock();
    clock.observe(1_700_000_100, 1_700_000_000);
    expect(clock.hasEstimate()).toBe(true);
    expect(clock.estimatedOffsetMs()).toBe(100);
    expect(clock.estimatedServerEpochMs(1_700_000_500)).toBe(1_700_000_400);
  });

  it("tracks the minimum (best-case) offset across jittery samples", () => {
    const clock = createFpElevatorServerClock();
    // Constant clock offset of 200ms with one-way latency jitter in [5, 40]ms.
    const offsets = [200 + 40, 200 + 30, 200 + 5, 200 + 25, 200 + 18];
    for (let i = 0; i < offsets.length; i++) {
      const receiveAt = 1_000 + i * 50 + offsets[i]!;
      const serverAt = 1_000 + i * 50;
      clock.observe(receiveAt, serverAt);
    }
    expect(clock.estimatedOffsetMs()).toBe(205);
  });

  it("recovers the min after the current best sample drops out of the window", () => {
    const clock = createFpElevatorServerClock({ windowMs: 500 });
    clock.observe(1_000 + 210, 1_000); // offset 210
    clock.observe(1_050 + 205, 1_050); // offset 205 (new min)
    clock.observe(1_100 + 220, 1_100); // offset 220
    clock.observe(1_150 + 230, 1_150); // offset 230
    expect(clock.estimatedOffsetMs()).toBe(205);

    // Advance observations far enough that the offset-205 sample falls out of the 500ms window.
    for (let i = 0; i < 20; i++) {
      const t = 1_600 + i * 60;
      clock.observe(t + 220, t);
    }
    expect(clock.estimatedOffsetMs()).toBe(220);
  });

  it("ignores non-finite observations", () => {
    const clock = createFpElevatorServerClock();
    clock.observe(1_000, 900); // offset 100
    clock.observe(Number.NaN, 950);
    clock.observe(1_050, Number.POSITIVE_INFINITY);
    expect(clock.estimatedOffsetMs()).toBe(100);
  });

  it("estimates server time consistent with observed samples under drift", () => {
    const clock = createFpElevatorServerClock();
    const CLOCK_OFFSET_MS = -350; // client is 350ms behind server
    const MIN_LATENCY_MS = 8;
    for (let i = 0; i < 40; i++) {
      const serverAt = 2_000_000 + i * 50;
      const latency = MIN_LATENCY_MS + (i % 7) * 4;
      const clientReceive = serverAt + CLOCK_OFFSET_MS + latency;
      clock.observe(clientReceive, serverAt);
    }
    // Estimated offset is (clock offset + min observed latency).
    expect(clock.estimatedOffsetMs()).toBe(CLOCK_OFFSET_MS + MIN_LATENCY_MS);
    // Mapping a client time back to server time should be accurate to min latency.
    const clientNow = 2_000_000 + 40 * 50 + CLOCK_OFFSET_MS;
    const serverNow = clock.estimatedServerEpochMs(clientNow);
    expect(Math.abs(serverNow - (clientNow - CLOCK_OFFSET_MS))).toBeLessThanOrEqual(MIN_LATENCY_MS);
  });
});

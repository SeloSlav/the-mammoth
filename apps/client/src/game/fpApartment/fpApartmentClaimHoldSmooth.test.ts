import { describe, expect, it } from "vitest";
import {
  computeOptimisticClaimProgressSecs,
  type ApartmentClaimHoldSmooth,
} from "./fpApartmentClaimHoldSmooth.js";

const FULL = 42;

describe("computeOptimisticClaimProgressSecs", () => {
  it("shows server secs when hold is inactive", () => {
    const prev: ApartmentClaimHoldSmooth | null = {
      unitKey: "uk1",
      serverSecsAtHoldStart: 0,
      wallMsAtHoldStart: 1000,
    };
    expect(
      computeOptimisticClaimProgressSecs({
        fullSecs: FULL,
        unitKey: "uk1",
        serverSecs: 5,
        nowMs: 5000,
        eligible: false,
        prevSmooth: prev,
      }),
    ).toEqual({ displaySecs: 5, nextSmooth: null });
  });

  it("tracks wall-clock while eligible", () => {
    const r = computeOptimisticClaimProgressSecs({
      fullSecs: FULL,
      unitKey: "uk",
      serverSecs: 0,
      nowMs: 10_000,
      eligible: true,
      prevSmooth: null,
    });
    expect(r.displaySecs).toBeGreaterThanOrEqual(0);
    expect(r.nextSmooth).not.toBeNull();

    const r2 = computeOptimisticClaimProgressSecs({
      fullSecs: FULL,
      unitKey: "uk",
      serverSecs: 0,
      nowMs: 11_500,
      eligible: true,
      prevSmooth: r.nextSmooth,
    });
    expect(r2.displaySecs).toBeCloseTo(1.5, 2);
    expect(r2.displaySecs).toBeGreaterThanOrEqual(0);

    const serverCatchUp = computeOptimisticClaimProgressSecs({
      fullSecs: FULL,
      unitKey: "uk",
      serverSecs: 2,
      nowMs: 12_500,
      eligible: true,
      prevSmooth: r.nextSmooth,
    });
    expect(serverCatchUp.displaySecs).toBeGreaterThanOrEqual(2);
  });

  it("never dips below authoritative serverSecs", () => {
    const r = computeOptimisticClaimProgressSecs({
      fullSecs: FULL,
      unitKey: "u",
      serverSecs: 10,
      nowMs: 0,
      eligible: true,
      prevSmooth: null,
    });
    expect(r.displaySecs).toBeGreaterThanOrEqual(10);
    const stale = computeOptimisticClaimProgressSecs({
      fullSecs: FULL,
      unitKey: "u",
      serverSecs: 9.5,
      nowMs: 100,
      eligible: true,
      prevSmooth: r.nextSmooth,
    });
    expect(stale.displaySecs).toBeGreaterThanOrEqual(10);
  });

  it("clips to fullSecs", () => {
    let prev: ApartmentClaimHoldSmooth | null = {
      unitKey: "u",
      serverSecsAtHoldStart: FULL - 0.05,
      wallMsAtHoldStart: 0,
    };
    const nearEnd = computeOptimisticClaimProgressSecs({
      fullSecs: FULL,
      unitKey: "u",
      serverSecs: FULL - 0.05,
      nowMs: 100_000,
      eligible: true,
      prevSmooth: prev,
    });
    expect(nearEnd.displaySecs).toBe(FULL);

    prev = {
      unitKey: "u",
      serverSecsAtHoldStart: 0,
      wallMsAtHoldStart: 0,
    };
    const big = computeOptimisticClaimProgressSecs({
      fullSecs: FULL,
      unitKey: "u",
      serverSecs: 0,
      nowMs: FULL * 1000,
      eligible: true,
      prevSmooth: prev,
    });
    expect(big.displaySecs).toBe(FULL);
  });
});

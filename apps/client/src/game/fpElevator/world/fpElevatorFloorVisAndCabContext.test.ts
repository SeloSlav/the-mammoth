import { describe, expect, it } from "vitest";
import { createFpElevatorFloorVisAndCabContext } from "./fpElevatorFloorVisAndCabContext.js";

function createContext() {
  return createFpElevatorFloorVisAndCabContext({
    buildingWorldOriginX: 0,
    buildingWorldOriginY: 0,
    buildingWorldOriginZ: 0,
    maxLevel: 40,
    floorSpacingM: 3.2,
    storeyOpts: {
      buildingWorldOriginY: 0,
      floorSpacingM: 3.2,
      maxLevel: 40,
    },
    floorVisPitchLookaheadWorldBoundsXz: {
      minX: -10,
      maxX: 10,
      minZ: -10,
      maxZ: 10,
    },
    visuals: new Map(),
    latest: new Map(),
    getCabY: () => Number.NaN,
    getDoor: () => 0,
    getCabVerticalVelocityMps: () => 0,
    serverClock: {
      estimatedOffsetMs: () => 0,
      hasEstimate: () => false,
    },
    elapsedSecSinceServerSample: () => 0,
    getRideClockOffsetMs: () => 0,
    cabFloorButtonDisplayLevel: () => 1,
  });
}

describe("getFloorVisibilityBand pitch lookahead", () => {
  it("keeps perimeter corridors on the current floor while feet remain inside the raw footprint", () => {
    const ctx = createContext();

    expect(
      ctx.getFloorVisibilityBand(
        9,
        60.9,
        0,
        0,
        62.45,
        -1,
        9,
        0,
        0,
        -1,
      ),
    ).toEqual({ lo: 20, hi: 20, hoistwayPlateBoost: false });
  });

  it("preserves vertical pitch lookahead for true exterior views", () => {
    const ctx = createContext();

    const band = ctx.getFloorVisibilityBand(
      12,
      60.9,
      0,
      0,
      62.45,
      -1,
      12,
      0,
      0,
      -1,
    );

    expect(band.lo).toBeLessThan(20);
    expect(band.hi).toBeGreaterThanOrEqual(20);
    expect(band.hoistwayPlateBoost).toBe(false);
  });
});

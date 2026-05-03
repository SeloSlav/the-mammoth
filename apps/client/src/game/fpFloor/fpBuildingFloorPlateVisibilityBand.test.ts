import { describe, expect, it } from "vitest";
import {
  fpCameraInsideBuildingFootprintXZ,
  fpBuildingExteriorViewShouldRevealFullStack,
  fpBuildingFloorPlateVisibilityBand,
  fpCameraOrFeetInsideBuildingFootprintXZ,
  fpCameraOrFeetNearBuildingFootprintXZ,
  fpStairShaftLocalVisibilityBand,
  fpStairColumnPlateVisibilityBand,
} from "./fpBuildingFloorPlateVisibilityBand.js";

describe("fpBuildingFloorPlateVisibilityBand", () => {
  it("uses full stack when revealFullStack is true", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 19,
        playerStorey: 3,
        revealFullStack: true,
      }),
    ).toEqual({ lo: 1, hi: 19 });
  });

  it("caps the interior band on tall stacks so distant plates are toggled off (corridor perf)", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 19,
        playerStorey: 10,
        revealFullStack: false,
      }),
    ).toEqual({ lo: 10, hi: 10 });
  });

  it("clamps to maxLevel at the top", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 5,
        playerStorey: 5,
        revealFullStack: false,
      }),
    ).toEqual({ lo: 5, hi: 5 });
  });

  it("clamps at ground", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 12,
        playerStorey: 1,
        revealFullStack: false,
      }),
    ).toEqual({ lo: 1, hi: 1 });
  });

  it("caps stair column band when pitch lookahead widens global plates but full stack is off", () => {
    expect(
      fpStairColumnPlateVisibilityBand({
        globalLo: 1,
        globalHi: 40,
        maxLevel: 80,
        playerStorey: 5,
      }),
    ).toEqual({ lo: 1, hi: 19 });
  });

  it("does not cap stair columns when the global band spans the full building (hoistway / exterior)", () => {
    expect(
      fpStairColumnPlateVisibilityBand({
        globalLo: 1,
        globalHi: 25,
        maxLevel: 25,
        playerStorey: 8,
      }),
    ).toEqual({ lo: 1, hi: 25 });
  });

  it("keeps stair column band inside a narrow global band", () => {
    expect(
      fpStairColumnPlateVisibilityBand({
        globalLo: 8,
        globalHi: 12,
        maxLevel: 40,
        playerStorey: 10,
      }),
    ).toEqual({ lo: 8, hi: 12 });
  });

  it("extends the upper band toward the storey the camera is looking at", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 19,
        playerStorey: 1,
        revealFullStack: false,
        upperTargetStorey: 8,
      }),
    ).toEqual({ lo: 1, hi: 10 });
  });

  it("hoistway plate boost widens budget vs interior-only caps but stays below full stack", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 80,
        playerStorey: 10,
        revealFullStack: false,
        elevatorHoistwayPlateBoost: true,
        upperTargetStorey: 80,
        lowerTargetStorey: 1,
      }),
    ).toEqual({ lo: 1, hi: 32 });
  });

  it("caps pitch lookahead above the player so stairwell upsights do not submit distant slabs", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 80,
        playerStorey: 5,
        revealFullStack: false,
        upperTargetStorey: 48,
      }),
    ).toEqual({ lo: 5, hi: 19 });
  });

  it("caps full-stack stair-shaft views to a local vertical budget", () => {
    expect(
      fpStairShaftLocalVisibilityBand({
        globalLo: 1,
        globalHi: 80,
        maxLevel: 80,
        playerStorey: 20,
      }),
    ).toEqual({ lo: 18, hi: 24 });
  });

  it("widens narrow corridor bands while inside a stair shaft", () => {
    expect(
      fpStairShaftLocalVisibilityBand({
        globalLo: 20,
        globalHi: 20,
        maxLevel: 80,
        playerStorey: 20,
      }),
    ).toEqual({ lo: 18, hi: 24 });
  });

  it("extends the lower band when looking downward (stairs / atrium)", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 19,
        playerStorey: 15,
        revealFullStack: false,
        lowerTargetStorey: 3,
      }),
    ).toEqual({ lo: 1, hi: 15 });
  });

  it("normalizes maxLevel when below 1", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 0,
        playerStorey: 1,
        revealFullStack: true,
      }),
    ).toEqual({ lo: 1, hi: 1 });
  });

  it("reveals the full stack when outside the footprint and facing the tower", () => {
    expect(
      fpBuildingExteriorViewShouldRevealFullStack({
        cameraX: -8,
        cameraZ: 0,
        boundsMinX: -2,
        boundsMaxX: 2,
        boundsMinZ: -3,
        boundsMaxZ: 3,
      }),
    ).toBe(true);
  });

  it("reveals the full stack for nearby peripheral exterior views", () => {
    expect(
      fpBuildingExteriorViewShouldRevealFullStack({
        cameraX: -8,
        cameraZ: 0,
        boundsMinX: -2,
        boundsMaxX: 2,
        boundsMinZ: -3,
        boundsMaxZ: 3,
      }),
    ).toBe(true);
  });

  it("keeps the optimization only when clearly inside the footprint core", () => {
    expect(
      fpBuildingExteriorViewShouldRevealFullStack({
        cameraX: 0,
        cameraZ: 0,
        boundsMinX: -12,
        boundsMaxX: 12,
        boundsMinZ: -12,
        boundsMaxZ: 12,
      }),
    ).toBe(false);
  });

  it("reveals the full stack near the perimeter even if technically inside the raw bounds", () => {
    expect(
      fpBuildingExteriorViewShouldRevealFullStack({
        cameraX: 10,
        cameraZ: 0,
        boundsMinX: -12,
        boundsMaxX: 12,
        boundsMinZ: -12,
        boundsMaxZ: 12,
      }),
    ).toBe(true);
  });

  it("still treats shallow perimeter XZ as inside for unit plaster (inset must not apply)", () => {
    expect(
      fpCameraOrFeetInsideBuildingFootprintXZ({
        cameraX: 10,
        cameraZ: 0,
        feetX: 10,
        feetZ: 0,
        boundsMinX: -12,
        boundsMaxX: 12,
        boundsMinZ: -12,
        boundsMaxZ: 12,
      }),
    ).toBe(true);
  });

  it("hides unit plaster only when both camera and feet are outside raw footprint", () => {
    expect(
      fpCameraOrFeetInsideBuildingFootprintXZ({
        cameraX: -20,
        cameraZ: 0,
        feetX: -20,
        feetZ: 0,
        boundsMinX: -12,
        boundsMaxX: 12,
        boundsMinZ: -12,
        boundsMaxZ: 12,
      }),
    ).toBe(false);
  });

  it("keeps plaster when feet remain inside even if camera leans past raw X", () => {
    expect(
      fpCameraOrFeetInsideBuildingFootprintXZ({
        cameraX: 13,
        cameraZ: 0,
        feetX: 10,
        feetZ: 0,
        boundsMinX: -12,
        boundsMaxX: 12,
        boundsMinZ: -12,
        boundsMaxZ: 12,
      }),
    ).toBe(true);
  });

  it("treats furniture props as outside when only feet remain inside the raw footprint", () => {
    expect(
      fpCameraInsideBuildingFootprintXZ({
        cameraX: 13,
        cameraZ: 0,
        boundsMinX: -12,
        boundsMaxX: 12,
        boundsMinZ: -12,
        boundsMaxZ: 12,
      }),
    ).toBe(false);
  });

  it("near footprint: false when both samples are well outside expanded slab", () => {
    expect(
      fpCameraOrFeetNearBuildingFootprintXZ({
        cameraX: -30,
        cameraZ: 0,
        feetX: -30,
        feetZ: 0,
        boundsMinX: -12,
        boundsMaxX: 12,
        boundsMinZ: -12,
        boundsMaxZ: 12,
        nearMarginM: 10,
      }),
    ).toBe(false);
  });

  it("near footprint: true when just outside raw AABB but within margin (peek / sidewalk)", () => {
    expect(
      fpCameraOrFeetNearBuildingFootprintXZ({
        cameraX: 14,
        cameraZ: 0,
        feetX: 14,
        feetZ: 0,
        boundsMinX: -12,
        boundsMaxX: 12,
        boundsMinZ: -12,
        boundsMaxZ: 12,
        nearMarginM: 10,
      }),
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  fpBuildingExteriorViewShouldRevealFullStack,
  fpBuildingFloorPlateVisibilityBand,
  fpCameraOrFeetInsideBuildingFootprintXZ,
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

  it("keeps every storey visible when not in shaft context (facade cohesion)", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 19,
        playerStorey: 10,
        revealFullStack: false,
      }),
    ).toEqual({ lo: 1, hi: 19 });
  });

  it("clamps to maxLevel at the top", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 5,
        playerStorey: 5,
        revealFullStack: false,
      }),
    ).toEqual({ lo: 1, hi: 5 });
  });

  it("clamps at ground", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 12,
        playerStorey: 1,
        revealFullStack: false,
      }),
    ).toEqual({ lo: 1, hi: 12 });
  });

  it("extends the upper band toward the storey the camera is looking at", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 19,
        playerStorey: 1,
        revealFullStack: false,
        upperTargetStorey: 8,
      }),
    ).toEqual({ lo: 1, hi: 19 });
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
});

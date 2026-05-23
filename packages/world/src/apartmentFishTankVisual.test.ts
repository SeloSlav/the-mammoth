import { describe, expect, it } from "vitest";
import {
  APARTMENT_FISH_TANK_DEPTH_M,
  APARTMENT_FISH_TANK_HEIGHT_M,
  APARTMENT_FISH_TANK_MODEL_PATH,
  APARTMENT_FISH_TANK_WIDTH_M,
  isApartmentFishTankModelPath,
} from "./apartmentFishTankVisual.js";

describe("apartment fish tank GLB metadata", () => {
  it("recognizes the authored catalog path", () => {
    expect(isApartmentFishTankModelPath(APARTMENT_FISH_TANK_MODEL_PATH)).toBe(true);
    expect(isApartmentFishTankModelPath("/static/models/objects/fish-tank.glb")).toBe(true);
    expect(isApartmentFishTankModelPath("static/models/objects/chair.glb")).toBe(false);
  });

  it("documents the authored GLB bounds used by placements", () => {
    expect(APARTMENT_FISH_TANK_WIDTH_M).toBeCloseTo(1.906, 3);
    expect(APARTMENT_FISH_TANK_HEIGHT_M).toBeCloseTo(1.429, 3);
    expect(APARTMENT_FISH_TANK_DEPTH_M).toBeCloseTo(1.037, 3);
  });
});

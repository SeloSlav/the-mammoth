import { describe, expect, it } from "vitest";
import {
  APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH,
  apartmentFishTankDecorTemplateDeps,
  normalizeApartmentFishTankModelRelPath,
} from "./apartmentFishTankDecorRuntime.js";

describe("apartmentFishTankDecorRuntime", () => {
  it("normalizes model paths", () => {
    expect(normalizeApartmentFishTankModelRelPath("fish-tank.glb")).toBe(
      "static/models/objects/fish-tank.glb",
    );
    expect(normalizeApartmentFishTankModelRelPath("static/models/objects/fish-tank.glb")).toBe(
      "static/models/objects/fish-tank.glb",
    );
  });

  it("pulls fish.glb when a main fish tank is placed", () => {
    expect(
      apartmentFishTankDecorTemplateDeps(["static/models/objects/fish-tank.glb"]),
    ).toEqual([APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH]);
    expect(
      apartmentFishTankDecorTemplateDeps(["static/models/objects/fish-tank-castle.glb"]),
    ).toEqual([]);
    expect(apartmentFishTankDecorTemplateDeps(["static/models/objects/chair.glb"])).toEqual([]);
  });
});

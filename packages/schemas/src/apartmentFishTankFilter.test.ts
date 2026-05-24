import { describe, expect, it } from "vitest";
import {
  apartmentFishTankFilterAcceptsDefId,
  isApartmentFishTankFilterModelRelPath,
} from "./apartmentFishTankFilter.js";

describe("apartmentFishTankFilter", () => {
  it("recognizes filter GLB path", () => {
    expect(isApartmentFishTankFilterModelRelPath("static/models/objects/fish-tank-filter.glb")).toBe(
      true,
    );
    expect(isApartmentFishTankFilterModelRelPath("static/models/objects/fish-tank.glb")).toBe(false);
  });

  it("accepts filter sponge cartridge in maintenance slot", () => {
    expect(apartmentFishTankFilterAcceptsDefId("fish-filter-sponge", "utility")).toBe(true);
    expect(apartmentFishTankFilterAcceptsDefId("duct-tape-roll", "resource")).toBe(false);
    expect(apartmentFishTankFilterAcceptsDefId("apple", "consumable")).toBe(false);
  });
});

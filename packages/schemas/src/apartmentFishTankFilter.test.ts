import { describe, expect, it } from "vitest";
import {
  apartmentFishTankFilterAcceptsDefId,
  FISH_TANK_FILTER_HEALTH_START,
  FISH_TANK_FILTER_OVERNIGHT_LOSS_OK,
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

  it("installed cartridge lasts about one in-game week at full health", () => {
    let health = FISH_TANK_FILTER_HEALTH_START;
    let nights = 0;
    while (health > 0) {
      health = Math.max(0, health - FISH_TANK_FILTER_OVERNIGHT_LOSS_OK);
      nights += 1;
    }
    expect(nights).toBeGreaterThanOrEqual(7);
    expect(nights).toBeLessThanOrEqual(8);
  });
});

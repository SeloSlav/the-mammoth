import { describe, expect, it } from "vitest";
import {
  apartmentFishTankAcceptsFeedDefId,
  APARTMENT_FISH_TANK_FEED_BLOCKED_DEF_IDS,
  isApartmentFishTankModelRelPath,
  OWNED_APARTMENT_MODEL_FISH_TANK,
} from "./apartmentFishTank.js";
import { ownedApartmentPlacedItemKindFromModelRelPath } from "./ownedApartmentBuiltins.js";

describe("apartmentFishTank", () => {
  it("recognizes the main tank GLB", () => {
    expect(isApartmentFishTankModelRelPath(OWNED_APARTMENT_MODEL_FISH_TANK)).toBe(true);
    expect(isApartmentFishTankModelRelPath("static/models/objects/fish-tank-castle.glb")).toBe(false);
  });

  it("maps main tank model to fish_tank placed kind", () => {
    expect(ownedApartmentPlacedItemKindFromModelRelPath(OWNED_APARTMENT_MODEL_FISH_TANK)).toBe(
      "fish_tank",
    );
  });

  it("accepts consumable food but blocks medicine and compost", () => {
    expect(apartmentFishTankAcceptsFeedDefId("apple", "consumable")).toBe(true);
    expect(apartmentFishTankAcceptsFeedDefId("fresh-dill", "consumable")).toBe(true);
    expect(apartmentFishTankAcceptsFeedDefId("bandage-roll", "consumable")).toBe(false);
    expect(
      apartmentFishTankAcceptsFeedDefId("balcony-grow-substrate", "resource"),
    ).toBe(false);
    expect(apartmentFishTankAcceptsFeedDefId("parsley-seeds", "resource")).toBe(false);
    for (const blocked of APARTMENT_FISH_TANK_FEED_BLOCKED_DEF_IDS) {
      expect(apartmentFishTankAcceptsFeedDefId(blocked, "consumable")).toBe(false);
    }
  });
});

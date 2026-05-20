import { describe, expect, it } from "vitest";
import {
  APARTMENT_UNIT_DECOR_ITEM_KIND_WATER_TANK,
  OWNED_APARTMENT_MODEL_WATER_TANK,
  apartmentUnitDecorItemKindFromString,
  ownedApartmentPlacedItemKindFromModelRelPath,
  ownedApartmentPlacedItemKindHasStash,
} from "./ownedApartmentBuiltins";
import { ownedApartmentPlacedItemKindIsSittable } from "./apartmentSittable";

describe("ownedApartmentPlacedItemKindFromModelRelPath", () => {
  it("maps water-tank.glb to water_tank decor role", () => {
    expect(ownedApartmentPlacedItemKindFromModelRelPath(OWNED_APARTMENT_MODEL_WATER_TANK)).toBe(
      "water_tank",
    );
  });

  it("treats water_tank as stash decor but not sittable", () => {
    expect(ownedApartmentPlacedItemKindHasStash("water_tank")).toBe(true);
    expect(ownedApartmentPlacedItemKindIsSittable("water_tank")).toBe(false);
  });

  it("syncs water_tank to server decor item_kind 6", () => {
    expect(apartmentUnitDecorItemKindFromString("water_tank")).toBe(
      APARTMENT_UNIT_DECOR_ITEM_KIND_WATER_TANK,
    );
  });
});

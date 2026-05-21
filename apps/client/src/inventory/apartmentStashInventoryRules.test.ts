import { describe, expect, it } from "vitest";
import {
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_WARDROBE,
  APARTMENT_STASH_KIND_WATER_TANK,
} from "@the-mammoth/schemas";
import type { MammothItemDef } from "./mammothItemCatalogTypes";
import { mammothItemAllowedInApartmentStash } from "./apartmentStashInventoryRules";

function def(
  category: MammothItemDef["category"],
  id = "test",
): MammothItemDef {
  return {
    id,
    displayName: "Test",
    description: "",
    category,
    maxStack: 1,
    meleeCombat: null,
    construction: null,
    consumeOnUse: null,
    hotbarConsumeSound: null,
    waterContainer: null,
    balconyGrow: null,
    balconyGrowFertilizer: false,
    iconUrl: "",
  };
}

describe("mammothItemAllowedInApartmentStash", () => {
  it("allows weapons in wardrobe but not consumables", () => {
    expect(mammothItemAllowedInApartmentStash(APARTMENT_STASH_KIND_WARDROBE, def("weapon"))).toBe(
      true,
    );
    expect(
      mammothItemAllowedInApartmentStash(APARTMENT_STASH_KIND_WARDROBE, def("consumable")),
    ).toBe(false);
  });

  it("allows consumables in stove", () => {
    expect(mammothItemAllowedInApartmentStash(APARTMENT_STASH_KIND_STOVE, def("consumable"))).toBe(
      true,
    );
    expect(mammothItemAllowedInApartmentStash(APARTMENT_STASH_KIND_STOVE, def("tool"))).toBe(false);
  });

  it("allows screwdriver (weapon category) in footlocker", () => {
    expect(mammothItemAllowedInApartmentStash(APARTMENT_STASH_KIND_FOOTLOCKER, def("weapon", "screwdriver"))).toBe(
      true,
    );
  });

  it("water tank only allows water-bottle", () => {
    expect(
      mammothItemAllowedInApartmentStash(
        APARTMENT_STASH_KIND_WATER_TANK,
        def("consumable", "water-bottle"),
      ),
    ).toBe(true);
    expect(
      mammothItemAllowedInApartmentStash(
        APARTMENT_STASH_KIND_WATER_TANK,
        def("consumable", "purification-tablets"),
      ),
    ).toBe(false);
  });
});

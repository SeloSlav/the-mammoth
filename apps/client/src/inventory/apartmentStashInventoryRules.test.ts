import { describe, expect, it } from "vitest";
import { APARTMENT_STASH_KIND_STOVE, APARTMENT_STASH_KIND_WARDROBE } from "@the-mammoth/schemas";
import type { MammothItemDef } from "./mammothItemCatalogTypes";
import { mammothItemAllowedInApartmentStash } from "./apartmentStashInventoryRules";

function def(category: MammothItemDef["category"]): MammothItemDef {
  return {
    id: "test",
    displayName: "Test",
    description: "",
    category,
    maxStack: 1,
    meleeCombat: null,
    construction: null,
    consumeOnUse: null,
    hotbarConsumeSound: null,
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
});

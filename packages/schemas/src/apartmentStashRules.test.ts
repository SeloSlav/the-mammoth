import { describe, expect, it } from "vitest";
import {
  APARTMENT_STASH_KIND_FRIDGE,
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_GROW_TRAY,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_WARDROBE,
  APARTMENT_STASH_KIND_WATER_TANK,
  apartmentStashAcceptsDefId,
  apartmentStashAcceptsItemCategory,
  apartmentStashHudSections,
  apartmentStashSlotCount,
  isApartmentStashSlotIndexValid,
} from "./apartmentStashRules";

describe("apartmentStashSlotCount", () => {
  it("assigns gameplay slot counts per furniture type", () => {
    expect(apartmentStashSlotCount(APARTMENT_STASH_KIND_FOOTLOCKER)).toBe(24);
    expect(apartmentStashSlotCount(APARTMENT_STASH_KIND_WARDROBE)).toBe(10);
    expect(apartmentStashSlotCount(APARTMENT_STASH_KIND_STOVE)).toBe(3);
    expect(apartmentStashSlotCount(APARTMENT_STASH_KIND_FRIDGE)).toBe(14);
    expect(apartmentStashSlotCount(APARTMENT_STASH_KIND_WATER_TANK)).toBe(1);
  });

  it("rejects out-of-range slot indices", () => {
    expect(isApartmentStashSlotIndexValid(APARTMENT_STASH_KIND_STOVE, 2)).toBe(true);
    expect(isApartmentStashSlotIndexValid(APARTMENT_STASH_KIND_STOVE, 3)).toBe(false);
    expect(isApartmentStashSlotIndexValid(APARTMENT_STASH_KIND_WATER_TANK, 0)).toBe(true);
    expect(isApartmentStashSlotIndexValid(APARTMENT_STASH_KIND_WATER_TANK, 1)).toBe(false);
  });
});

describe("apartmentStashAcceptsItemCategory", () => {
  it("allows any category in footlocker", () => {
    expect(apartmentStashAcceptsItemCategory(APARTMENT_STASH_KIND_FOOTLOCKER, "resource")).toBe(true);
    expect(apartmentStashAcceptsItemCategory(APARTMENT_STASH_KIND_FOOTLOCKER, "consumable")).toBe(true);
  });

  it("restricts wardrobe to gear categories", () => {
    expect(apartmentStashAcceptsItemCategory(APARTMENT_STASH_KIND_WARDROBE, "weapon")).toBe(true);
    expect(apartmentStashAcceptsItemCategory(APARTMENT_STASH_KIND_WARDROBE, "consumable")).toBe(false);
    expect(apartmentStashAcceptsItemCategory(APARTMENT_STASH_KIND_WARDROBE, "resource")).toBe(false);
  });

  it("restricts fridge and stove to consumables", () => {
    expect(apartmentStashAcceptsItemCategory(APARTMENT_STASH_KIND_FRIDGE, "consumable")).toBe(true);
    expect(apartmentStashAcceptsItemCategory(APARTMENT_STASH_KIND_FRIDGE, "weapon")).toBe(false);
    expect(apartmentStashAcceptsItemCategory(APARTMENT_STASH_KIND_STOVE, "consumable")).toBe(true);
    expect(apartmentStashAcceptsItemCategory(APARTMENT_STASH_KIND_STOVE, "tool")).toBe(false);
  });
});

describe("apartmentStashAcceptsDefId", () => {
  it("water tank only accepts water-bottle", () => {
    expect(
      apartmentStashAcceptsDefId(APARTMENT_STASH_KIND_WATER_TANK, "water-bottle", "tool"),
    ).toBe(true);
    expect(
      apartmentStashAcceptsDefId(
        APARTMENT_STASH_KIND_WATER_TANK,
        "purification-tablets",
        "consumable",
      ),
    ).toBe(false);
  });

  it("fridge accepts consumables and water bottles (tool)", () => {
    expect(apartmentStashAcceptsDefId(APARTMENT_STASH_KIND_FRIDGE, "apple", "consumable")).toBe(
      true,
    );
    expect(apartmentStashAcceptsDefId(APARTMENT_STASH_KIND_FRIDGE, "water-bottle", "tool")).toBe(
      true,
    );
    expect(apartmentStashAcceptsDefId(APARTMENT_STASH_KIND_FRIDGE, "knife", "weapon")).toBe(false);
  });

  it("grow tray accepts substrate only", () => {
    expect(
      apartmentStashAcceptsDefId(
        APARTMENT_STASH_KIND_GROW_TRAY,
        "balcony-grow-substrate",
        "resource",
      ),
    ).toBe(true);
    expect(
      apartmentStashAcceptsDefId(APARTMENT_STASH_KIND_GROW_TRAY, "lovage-seeds", "resource"),
    ).toBe(false);
  });
});

describe("apartmentStashHudSections", () => {
  it("models stove as 2 burners + 1 oven slot", () => {
    const sections = apartmentStashHudSections(APARTMENT_STASH_KIND_STOVE);
    expect(sections).toEqual([
      { label: "Burners", slotIndices: [0, 1], cols: 2 },
      { label: "Oven", slotIndices: [2], cols: 1 },
    ]);
  });
});

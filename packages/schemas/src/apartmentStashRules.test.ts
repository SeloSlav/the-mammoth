import { describe, expect, it } from "vitest";
import {
  APARTMENT_STASH_KIND_FRIDGE,
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_WARDROBE,
  apartmentStashAcceptsItemCategory,
  apartmentStashHudSections,
  apartmentStashSlotCount,
  isApartmentStashSlotIndexValid,
} from "./apartmentStashRules";

describe("apartmentStashSlotCount", () => {
  it("assigns gameplay slot counts per furniture type", () => {
    expect(apartmentStashSlotCount(APARTMENT_STASH_KIND_FOOTLOCKER)).toBe(24);
    expect(apartmentStashSlotCount(APARTMENT_STASH_KIND_WARDROBE)).toBe(10);
    expect(apartmentStashSlotCount(APARTMENT_STASH_KIND_STOVE)).toBe(6);
    expect(apartmentStashSlotCount(APARTMENT_STASH_KIND_FRIDGE)).toBe(14);
  });

  it("rejects out-of-range slot indices", () => {
    expect(isApartmentStashSlotIndexValid(APARTMENT_STASH_KIND_STOVE, 5)).toBe(true);
    expect(isApartmentStashSlotIndexValid(APARTMENT_STASH_KIND_STOVE, 6)).toBe(false);
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

describe("apartmentStashHudSections", () => {
  it("models stove as 4 burners + 2 oven slots", () => {
    const sections = apartmentStashHudSections(APARTMENT_STASH_KIND_STOVE);
    expect(sections).toEqual([
      { label: "Burners", slotIndices: [0, 1, 2, 3], cols: 4 },
      { label: "Oven", slotIndices: [4, 5], cols: 2 },
    ]);
  });
});

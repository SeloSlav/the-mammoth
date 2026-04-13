import { describe, expect, it } from "vitest";
import { mammothShowStackQuantityOnSlotIcon } from "./inventoryStackBadge";
import type { MammothItemDef } from "./mammothItemCatalogTypes";

function def(maxStack: number): MammothItemDef {
  return {
    id: "test",
    displayName: "Test",
    description: "",
    category: "consumable",
    maxStack,
    construction: null,
    consumeOnUse: null,
    iconUrl: "",
  };
}

describe("mammothShowStackQuantityOnSlotIcon", () => {
  it("hides for non-stackable or single count", () => {
    expect(mammothShowStackQuantityOnSlotIcon(def(1), 5)).toBe(false);
    expect(mammothShowStackQuantityOnSlotIcon(def(24), 1)).toBe(false);
  });

  it("shows when stackable and quantity > 1", () => {
    expect(mammothShowStackQuantityOnSlotIcon(def(24), 2)).toBe(true);
    expect(mammothShowStackQuantityOnSlotIcon(def(24), 24)).toBe(true);
  });
});

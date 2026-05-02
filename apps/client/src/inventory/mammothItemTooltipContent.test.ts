import { describe, expect, it } from "vitest";
import type { InventoryItem } from "../module_bindings/types";
import {
  buildMammothItemTooltipContent,
  formatMammothItemCategory,
} from "./mammothItemTooltipContent";
import { getMammothItemDef } from "./mammothItemCatalog";

function stubInventoryItem(partial: Partial<InventoryItem> & Pick<InventoryItem, "defId" | "quantity">): InventoryItem {
  return {
    instanceId: 99n,
    location: { tag: "Unknown" },
    ...partial,
  } as InventoryItem;
}

describe("formatMammothItemCategory", () => {
  it("formats catalog categories", () => {
    expect(formatMammothItemCategory("weapon")).toBe("Weapon");
    expect(formatMammothItemCategory("consumable")).toBe("Consumable");
    expect(formatMammothItemCategory("placeable")).toBe("Placeable");
    expect(formatMammothItemCategory("resource")).toBe("Resource");
    expect(formatMammothItemCategory("ammo")).toBe("Ammo");
    expect(formatMammothItemCategory("utility")).toBe("Utility");
  });
});

describe("buildMammothItemTooltipContent", () => {
  it("includes melee damage and recipe hints for crafted weapons", () => {
    const def = getMammothItemDef("knife");
    expect(def).toBeDefined();
    const content = buildMammothItemTooltipContent({
      def: def!,
      instance: stubInventoryItem({ defId: "knife", quantity: 1 }),
    });
    expect(content.name).toBe("Knife");
    expect(content.category).toBe("Weapon");
    expect(content.stats?.some((s) => s.label === "Damage" && s.value === 12)).toBe(true);
    expect(content.stats?.some((s) => s.label === "Build time")).toBe(true);
    expect(content.description?.length).toBeGreaterThan(0);
  });

  it("shows consume deltas for edible items", () => {
    const def = getMammothItemDef("apple");
    expect(def?.consumeOnUse).toBeTruthy();
    const content = buildMammothItemTooltipContent({
      def: def!,
      instance: stubInventoryItem({ defId: "apple", quantity: 3 }),
    });
    expect(content.stats?.some((s) => s.label === "Quantity" && s.value === 3)).toBe(true);
    expect(content.stats?.some((s) => s.label === "Health" || s.label === "Hunger")).toBe(true);
  });
});

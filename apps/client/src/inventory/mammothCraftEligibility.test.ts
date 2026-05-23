import { describe, expect, it } from "vitest";
import {
  canCraftItem,
  canEnqueueCraft,
  carrierCountForDef,
  MAX_CRAFT_QUEUE_PER_PLAYER,
} from "./mammothCraftEligibility";
import type { MammothItemDef } from "./mammothItemCatalogTypes";
import type { MammothPopulatedItem } from "./inventoryDragDropTypes";

function mockPop(defId: string, qty: number): MammothPopulatedItem {
  return {
    instance: { instanceId: 1n, defId, quantity: qty, location: {} as never },
    def: {
      id: defId,
      displayName: defId,
      category: "resource",
      maxStack: 99,
    } as MammothItemDef,
  };
}

describe("mammothCraftEligibility", () => {
  it("sums carrier stacks across hotbar and inventory", () => {
    const grids = {
      hotbar: [mockPop("scrap-metal", 3), null, null, null, null, null],
      inventory: [mockPop("scrap-metal", 2), null, null, null, null, null, null, null, null, null, null, null],
    };
    expect(carrierCountForDef(grids, "scrap-metal")).toBe(5);
  });

  it("blocks enqueue when materials or queue are missing", () => {
    const def = {
      id: "door-lock",
      displayName: "Door lock",
      category: "utility",
      maxStack: 1,
      construction: {
        buildTimeSecs: 5,
        materials: [{ itemId: "scrap-metal", quantity: 5 }],
        requiredTools: ["screwdriver"],
      },
    } as MammothItemDef;
    const grids = {
      hotbar: [mockPop("screwdriver", 1), null, null, null, null, null],
      inventory: [mockPop("scrap-metal", 4), null, null, null, null, null, null, null, null, null, null, null],
    };
    expect(canCraftItem(def, grids)).toBe(false);
    expect(canEnqueueCraft(def, grids, 0)).toBe(false);
    grids.inventory[0] = mockPop("scrap-metal", 5);
    expect(canCraftItem(def, grids)).toBe(true);
    expect(canEnqueueCraft(def, grids, MAX_CRAFT_QUEUE_PER_PLAYER)).toBe(false);
  });
});

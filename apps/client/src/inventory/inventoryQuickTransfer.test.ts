import { describe, expect, it } from "vitest";
import type { MammothPopulatedItem } from "./inventoryDragDropTypes";
import { destIndexForQuickTransfer, firstEmptySlotIndex } from "./inventoryQuickTransfer";

function mockPop(defId: string, quantity: number, maxStack: number): MammothPopulatedItem {
  return {
    instance: { defId, quantity, instanceId: 1n } as MammothPopulatedItem["instance"],
    def: { maxStack } as MammothPopulatedItem["def"],
  };
}

describe("firstEmptySlotIndex", () => {
  it("returns first null index", () => {
    expect(firstEmptySlotIndex(["a", null, "c"])).toBe(1);
  });

  it("treats undefined as empty", () => {
    expect(firstEmptySlotIndex([1, undefined, 3])).toBe(1);
  });

  it("returns null when full", () => {
    expect(firstEmptySlotIndex([1, 2])).toBe(null);
  });

  it("returns 0 when first slot is empty", () => {
    expect(firstEmptySlotIndex([null, 1])).toBe(0);
  });
});

describe("destIndexForQuickTransfer", () => {
  it("prefers first empty slot", () => {
    const moving = mockPop("a", 1, 10);
    expect(destIndexForQuickTransfer([null, mockPop("b", 1, 10)], moving)).toBe(0);
    expect(destIndexForQuickTransfer([mockPop("b", 1, 10), null], moving)).toBe(1);
  });

  it("when full, prefers merge-compatible slot", () => {
    const moving = mockPop("wood", 3, 10);
    const dest = [mockPop("stone", 1, 10), mockPop("wood", 5, 10)];
    expect(destIndexForQuickTransfer(dest, moving)).toBe(1);
  });

  it("when full and no merge, returns 0 for swap", () => {
    const moving = mockPop("wood", 1, 1);
    const dest = [mockPop("stone", 1, 10), mockPop("ore", 1, 10)];
    expect(destIndexForQuickTransfer(dest, moving)).toBe(0);
  });
});

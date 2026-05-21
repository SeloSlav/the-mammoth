import { describe, expect, it } from "vitest";
import type { MammothPopulatedItem } from "./inventoryDragDropTypes";
import {
  destIndexForQuickTransfer,
  destPlayerCarrySlotForQuickTransfer,
  firstEmptySlotIndex,
} from "./inventoryQuickTransfer";

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

describe("destPlayerCarrySlotForQuickTransfer", () => {
  it("prefers first empty hotbar slot over empty inventory", () => {
    const moving = mockPop("bandage", 1, 10);
    const hotbar = [null, mockPop("knife", 1, 1)];
    const inventory = [null, null];
    expect(destPlayerCarrySlotForQuickTransfer(hotbar, inventory, moving)).toEqual({
      type: "hotbar",
      index: 0,
    });
  });

  it("merges into hotbar before using inventory", () => {
    const moving = mockPop("ammo-9mm", 5, 30);
    const hotbar = [mockPop("ammo-9mm", 10, 30), mockPop("knife", 1, 1)];
    const inventory = [null];
    expect(destPlayerCarrySlotForQuickTransfer(hotbar, inventory, moving)).toEqual({
      type: "hotbar",
      index: 0,
    });
  });

  it("falls back to inventory when hotbar has no room", () => {
    const moving = mockPop("wood", 1, 10);
    const hotbar = [mockPop("stone", 1, 10), mockPop("ore", 1, 10)];
    const inventory = [null, mockPop("cloth", 1, 10)];
    expect(destPlayerCarrySlotForQuickTransfer(hotbar, inventory, moving)).toEqual({
      type: "inventory",
      index: 0,
    });
  });
});

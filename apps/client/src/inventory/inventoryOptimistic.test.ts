import { describe, expect, it } from "vitest";
import type { MammothPopulatedItem } from "./inventoryDragDropTypes";
import { predictSlotMove, predictWorldDrop } from "./inventoryOptimistic";

function item(instanceNum: number, defId: string, qty: number, max: number): MammothPopulatedItem {
  return {
    instance: {
      instanceId: BigInt(instanceNum),
      defId,
      quantity: qty,
      location: { tag: "Hotbar", value: {} as never },
    },
    def: {
      id: defId,
      displayName: defId,
      description: "",
      category: "weapon",
      maxStack: max,
      construction: null,
      consumeOnUse: null,
      iconUrl: "",
    },
  };
}

describe("inventoryOptimistic", () => {
  it("moves into an empty slot", () => {
    const grids = {
      hotbar: [item(101, "knife", 1, 1), null, null, null, null, null],
      inventory: Array.from({ length: 24 }, () => null),
    };
    const next = predictSlotMove(
      grids,
      { type: "hotbar", index: 0 },
      { type: "hotbar", index: 1 },
    );
    expect(next?.hotbar[0]).toBeNull();
    expect(next?.hotbar[1]?.instance.defId).toBe("knife");
  });

  it("swaps two different items", () => {
    const grids = {
      hotbar: [item(201, "knife", 1, 1), item(202, "crowbar", 1, 1), null, null, null, null],
      inventory: Array.from({ length: 24 }, () => null),
    };
    const next = predictSlotMove(
      grids,
      { type: "hotbar", index: 0 },
      { type: "hotbar", index: 1 },
    );
    expect(next?.hotbar[0]?.instance.defId).toBe("crowbar");
    expect(next?.hotbar[1]?.instance.defId).toBe("knife");
  });

  it("predictWorldDrop clears source", () => {
    const grids = {
      hotbar: [item(301, "knife", 1, 1), null, null, null, null, null],
      inventory: Array.from({ length: 24 }, () => null),
    };
    const next = predictWorldDrop(grids, { type: "hotbar", index: 0 }, 1);
    expect(next?.hotbar[0]).toBeNull();
  });
});

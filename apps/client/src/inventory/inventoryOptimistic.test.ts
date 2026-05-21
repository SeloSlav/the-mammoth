import { describe, expect, it } from "vitest";
import type { MammothPopulatedItem } from "./inventoryDragDropTypes";
import { inventorySlotGridsMatch, predictSlotMove, predictWorldDrop } from "./inventoryOptimistic";

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
      meleeCombat: null,
      construction: null,
      consumeOnUse: null,
      hotbarConsumeSound: null,
    waterContainer: null,
    balconyGrow: null,
    balconyGrowFertilizer: false,
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

  it("moves between inventory and stash slots", () => {
    const grids = {
      hotbar: [null, null, null, null, null, null],
      inventory: [item(251, "bandage", 3, 10), ...Array.from({ length: 23 }, () => null)],
      stash: Array.from({ length: 24 }, () => null),
    };
    const next = predictSlotMove(
      grids,
      { type: "inventory", index: 0 },
      { type: "stash", index: 4 },
    );
    expect(next?.inventory[0]).toBeNull();
    expect(next?.stash?.[4]?.instance.defId).toBe("bandage");
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

describe("inventorySlotGridsMatch", () => {
  const emptyInv = () => Array.from({ length: 24 }, () => null);

  it("returns true for identical slot populations", () => {
    const a = {
      hotbar: [item(401, "knife", 1, 1), null, null, null, null, null],
      inventory: emptyInv(),
    };
    const b = {
      hotbar: [item(401, "knife", 1, 1), null, null, null, null, null],
      inventory: emptyInv(),
    };
    expect(inventorySlotGridsMatch(a, b)).toBe(true);
  });

  it("returns false when an instance id differs", () => {
    const a = {
      hotbar: [item(501, "knife", 1, 1), null, null, null, null, null],
      inventory: emptyInv(),
    };
    const b = {
      hotbar: [item(502, "knife", 1, 1), null, null, null, null, null],
      inventory: emptyInv(),
    };
    expect(inventorySlotGridsMatch(a, b)).toBe(false);
  });

  it("returns false when quantity differs", () => {
    const a = {
      hotbar: [item(601, "bandage", 3, 10), null, null, null, null, null],
      inventory: emptyInv(),
    };
    const b = {
      hotbar: [item(601, "bandage", 2, 10), null, null, null, null, null],
      inventory: emptyInv(),
    };
    expect(inventorySlotGridsMatch(a, b)).toBe(false);
  });

  it("returns true when predicted move matches replicated outcome", () => {
    const before = {
      hotbar: [item(701, "knife", 1, 1), null, null, null, null, null],
      inventory: emptyInv(),
    };
    const predicted = predictSlotMove(before, { type: "hotbar", index: 0 }, { type: "hotbar", index: 2 });
    expect(predicted).not.toBeNull();
    expect(inventorySlotGridsMatch(predicted!, predicted!)).toBe(true);
    expect(inventorySlotGridsMatch(predicted!, before)).toBe(false);
  });

  it("compares stash slot populations when present", () => {
    const a = {
      hotbar: [null, null, null, null, null, null],
      inventory: emptyInv(),
      stash: [item(801, "bandage", 3, 10), ...Array.from({ length: 23 }, () => null)],
    };
    const b = {
      hotbar: [null, null, null, null, null, null],
      inventory: emptyInv(),
      stash: [item(801, "bandage", 3, 10), ...Array.from({ length: 23 }, () => null)],
    };
    const c = {
      hotbar: [null, null, null, null, null, null],
      inventory: emptyInv(),
      stash: [item(801, "bandage", 2, 10), ...Array.from({ length: 23 }, () => null)],
    };
    expect(inventorySlotGridsMatch(a, b)).toBe(true);
    expect(inventorySlotGridsMatch(a, c)).toBe(false);
  });
});

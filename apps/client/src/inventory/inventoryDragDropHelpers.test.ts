import { describe, expect, it } from "vitest";
import type { MammothPopulatedItem } from "./inventoryDragDropTypes";
import { evaluateInventoryDrop } from "./inventoryDragDropHelpers";
import type { SlotGrids } from "./inventoryOptimistic";

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
      category: "resource",
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

const conn = { identity: null } as never;

describe("evaluateInventoryDrop", () => {
  it("returns noop when merge prediction fails (full target stack)", () => {
    const grids: SlotGrids = {
      hotbar: [item(1, "bandage", 4, 10), item(2, "bandage", 10, 10), null, null, null, null],
      inventory: Array.from({ length: 24 }, () => null),
    };
    const src = {
      item: grids.hotbar[0]!,
      sourceSlot: { type: "hotbar" as const, index: 0 },
      dragQuantity: 1,
    };
    const evaluation = evaluateInventoryDrop({
      grids,
      src,
      result: { kind: "slot", slot: { type: "hotbar", index: 1 } },
      rules: { conn, activeStash: null },
    });
    expect(evaluation.kind).toBe("noop");
  });

  it("returns slot when merge succeeds", () => {
    const grids: SlotGrids = {
      hotbar: [item(1, "bandage", 4, 10), item(2, "bandage", 3, 10), null, null, null, null],
      inventory: Array.from({ length: 24 }, () => null),
    };
    const src = {
      item: grids.hotbar[0]!,
      sourceSlot: { type: "hotbar" as const, index: 0 },
      dragQuantity: 4,
    };
    const evaluation = evaluateInventoryDrop({
      grids,
      src,
      result: { kind: "slot", slot: { type: "hotbar", index: 1 } },
      rules: { conn, activeStash: null },
    });
    expect(evaluation.kind).toBe("slot");
    if (evaluation.kind === "slot") {
      expect(evaluation.predicted.hotbar[1]?.instance.quantity).toBe(7);
    }
  });
});

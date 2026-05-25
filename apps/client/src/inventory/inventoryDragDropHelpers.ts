import type { DbConnection } from "../module_bindings";
import type { ApartmentStashKind } from "../game/fpApartment/fpApartmentStashKey";
import type { FpActiveStashPanelState } from "../game/fpInteraction/fpActiveStashPanel";
import {
  clientMayPushToActiveApartmentStash,
  isApartmentStashSlotIndexValid,
  mammothItemAllowedInApartmentStashAtSlot,
} from "./apartmentStashInventoryRules";
import type {
  MammothDraggedItemInfo,
  MammothDragSourceSlotInfo,
  MammothDropResult,
} from "./inventoryDragDropTypes";
import { inventoryReducerQuantityArg } from "./inventoryDragMove";
import { predictSlotMove, predictWorldDrop, type SlotGrids } from "./inventoryOptimistic";

export type InventoryDragDropRulesContext = {
  conn: DbConnection;
  activeStash: FpActiveStashPanelState | null;
  /** Open stash panel identity — used when evaluating cross-panel stash moves. */
  openStash?: { stashKey: string; stashKind: ApartmentStashKind };
};

export function mammothInventorySlotUnderPoint(
  clientX: number,
  clientY: number,
): MammothDragSourceSlotInfo | null {
  const el = document.elementFromPoint(clientX, clientY);
  const slot = el?.closest("[data-slot-type]") as HTMLElement | null;
  if (!slot) return null;
  const type = slot.getAttribute("data-slot-type") as MammothDragSourceSlotInfo["type"] | null;
  const idx = slot.getAttribute("data-slot-index");
  if (type !== "inventory" && type !== "hotbar" && type !== "stash") return null;
  if (idx === null) return null;
  const index = Number.parseInt(idx, 10);
  if (Number.isNaN(index)) return null;
  return { type, index };
}

export function mammothInventoryResolveDropResult(
  clientX: number,
  clientY: number,
  sourceSlot: MammothDragSourceSlotInfo,
): MammothDropResult {
  const targetSlot = mammothInventorySlotUnderPoint(clientX, clientY);
  if (!targetSlot) return { kind: "world" };
  if (targetSlot.type === sourceSlot.type && targetSlot.index === sourceSlot.index) {
    return { kind: "cancel" };
  }
  return { kind: "slot", slot: targetSlot };
}

function stashPanelFromRules(rules: InventoryDragDropRulesContext): FpActiveStashPanelState | null {
  if (rules.activeStash) return rules.activeStash;
  if (!rules.openStash) return null;
  return {
    stashKey: rules.openStash.stashKey,
    stashLabel: "",
    stashKind: rules.openStash.stashKind,
  };
}

function stashKindFromRules(rules: InventoryDragDropRulesContext): ApartmentStashKind | null {
  return rules.activeStash?.stashKind ?? rules.openStash?.stashKind ?? null;
}

/** Mirrors stash-side validation before optimistic updates or reducer calls. */
export function evaluateInventoryStashTarget(
  rules: InventoryDragDropRulesContext,
  src: MammothDraggedItemInfo,
  target: MammothDragSourceSlotInfo,
): "ok" | "reject" | "blocked" {
  if (target.type !== "stash") return "ok";
  const stashKind = stashKindFromRules(rules);
  if (!stashKind) return "blocked";
  if (!isApartmentStashSlotIndexValid(stashKind, target.index)) return "reject";
  if (src.sourceSlot.type === "stash") return "ok";
  if (!mammothItemAllowedInApartmentStashAtSlot(stashKind, src.item.def, target.index)) return "reject";
  const panel = stashPanelFromRules(rules);
  if (!panel) return "blocked";
  if (!clientMayPushToActiveApartmentStash(rules.conn, panel)) return "blocked";
  return "ok";
}

export type InventoryDropEvaluation =
  | { kind: "cancel" }
  | { kind: "noop" }
  | { kind: "rejectStash"; stashKind: ApartmentStashKind }
  | { kind: "world"; predicted: SlotGrids; quantityToDrop: number }
  | {
      kind: "slot";
      predicted: SlotGrids;
      target: MammothDragSourceSlotInfo;
      quantityToMove: number;
    };

export function evaluateInventoryDrop(args: {
  grids: SlotGrids;
  src: MammothDraggedItemInfo;
  result: MammothDropResult;
  rules: InventoryDragDropRulesContext;
  /** Stash HUD only handles moves that touch the stash grid. */
  requireStashInvolvement?: boolean;
}): InventoryDropEvaluation {
  const { grids, src, result, rules } = args;
  if (result.kind === "cancel") return { kind: "cancel" };

  const quantityToMove = inventoryReducerQuantityArg(
    src.dragQuantity,
    src.item.instance.quantity,
  );
  const predictQty = quantityToMove === 0 ? undefined : src.dragQuantity;

  if (result.kind === "world") {
    const predicted = predictWorldDrop(grids, src.sourceSlot, src.dragQuantity);
    if (!predicted) return { kind: "noop" };
    return { kind: "world", predicted, quantityToDrop: src.dragQuantity };
  }

  const target = result.slot;
  if (args.requireStashInvolvement && target.type !== "stash" && src.sourceSlot.type !== "stash") {
    return { kind: "noop" };
  }

  const stashTarget = evaluateInventoryStashTarget(rules, src, target);
  if (stashTarget === "reject") {
    const kind = stashKindFromRules(rules);
    return kind ? { kind: "rejectStash", stashKind: kind } : { kind: "noop" };
  }
  if (stashTarget === "blocked") return { kind: "noop" };

  const predicted = predictSlotMove(grids, src.sourceSlot, target, predictQty);
  if (!predicted) return { kind: "noop" };
  return { kind: "slot", predicted, target, quantityToMove };
}

export function inventorySlotAcceptsDrag(
  grids: SlotGrids,
  src: MammothDraggedItemInfo,
  target: MammothDragSourceSlotInfo,
  rules: InventoryDragDropRulesContext,
  requireStashInvolvement = false,
): boolean {
  if (target.type === src.sourceSlot.type && target.index === src.sourceSlot.index) return false;
  const evaluation = evaluateInventoryDrop({
    grids,
    src,
    result: { kind: "slot", slot: target },
    rules,
    requireStashInvolvement,
  });
  return evaluation.kind === "slot";
}

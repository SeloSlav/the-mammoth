import type { DbConnection } from "../module_bindings";
import type { FpActiveStashPanelState } from "../game/fpInteraction/fpActiveStashPanel";
import {
  clientMayPushToActiveApartmentStash,
  mammothItemAllowedInApartmentStash,
  reportApartmentStashRejection,
} from "./apartmentStashInventoryRules";
import type { MammothDragSourceSlotInfo, MammothPopulatedItem } from "./inventoryDragDropTypes";
import { destIndexForQuickTransfer, destPlayerCarrySlotForQuickTransfer } from "./inventoryQuickTransfer";
import { playInventoryItemDragDropSound, playInventoryItemDragPickSound } from "./inventoryDragUiSound";
import type { SlotGrids } from "./inventoryOptimistic";
import type { MammothHotLootContext } from "./mammothHotLootSlotKey";

function toInstanceId(pop: MammothPopulatedItem): bigint {
  const id = pop.instance.instanceId;
  return typeof id === "bigint" ? id : BigInt(id as number);
}

/** Deposit one player hotbar/inventory stack into the open apartment stash (server picks merge slot). */
export function hotLootDepositPlayerItemToStash(
  conn: DbConnection,
  activeStash: FpActiveStashPanelState,
  grids: SlotGrids,
  pop: MammothPopulatedItem,
): boolean {
  if (document.body.classList.contains("item-dragging")) return false;
  if (!mammothItemAllowedInApartmentStash(activeStash.stashKind, pop.def)) {
    reportApartmentStashRejection(activeStash.stashKind);
    return false;
  }
  if (!clientMayPushToActiveApartmentStash(conn, activeStash)) return false;

  const destIndex = destIndexForQuickTransfer(grids.stash ?? [], pop);
  playInventoryItemDragDropSound();
  try {
    void conn.reducers.stashPushItemToSlot({
      itemInstanceId: toInstanceId(pop),
      unitKey: activeStash.stashKey,
      targetStashSlot: destIndex,
      quantityToMove: 0,
    });
    return true;
  } catch (err) {
    console.warn("[hotLoot] deposit failed", err);
    return false;
  }
}

/** Withdraw one stash stack into player hotbar/inventory (server merge order). */
export function hotLootWithdrawStashItemToPlayer(
  conn: DbConnection,
  activeStash: FpActiveStashPanelState,
  grids: SlotGrids,
  pop: MammothPopulatedItem,
  fromStashIndex: number,
): boolean {
  if (document.body.classList.contains("item-dragging")) return false;

  const dest = destPlayerCarrySlotForQuickTransfer(grids.hotbar, grids.inventory, pop);
  playInventoryItemDragPickSound();
  try {
    if (dest.type === "hotbar") {
      void conn.reducers.stashPullItemToHotbarSlot({
        itemInstanceId: toInstanceId(pop),
        unitKey: activeStash.stashKey,
        targetHotbarSlot: dest.index,
        quantityToMove: 0,
      });
    } else {
      void conn.reducers.stashPullItemToInventorySlot({
        itemInstanceId: toInstanceId(pop),
        unitKey: activeStash.stashKey,
        targetInventorySlot: dest.index,
        quantityToMove: 0,
      });
    }
    return true;
  } catch (err) {
    console.warn("[hotLoot] withdraw failed", err);
    return false;
  }
}

export type HotLootTransferArgs = {
  conn: DbConnection;
  activeStash: FpActiveStashPanelState;
  grids: SlotGrids;
  pop: MammothPopulatedItem;
  slotInfo: MammothDragSourceSlotInfo;
  context: MammothHotLootContext;
};

export function executeHotLootTransfer({
  conn,
  activeStash,
  grids,
  pop,
  slotInfo,
  context,
}: HotLootTransferArgs): boolean {
  if (context === "player") {
    return hotLootDepositPlayerItemToStash(conn, activeStash, grids, pop);
  }
  if (slotInfo.type !== "stash") return false;
  return hotLootWithdrawStashItemToPlayer(conn, activeStash, grids, pop, slotInfo.index);
}

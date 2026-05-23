import { useEffect, useMemo, useState } from "react";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../module_bindings";
import type { InventoryItem } from "../module_bindings/types";
import type { ApartmentStashKind } from "./apartmentStashInventoryRules";
import { apartmentDecorStashKindResolver } from "./apartmentStashInventoryRules";
import { apartmentStashKeyMatchesRow } from "../game/fpApartment/fpApartmentStashKey";
import { APARTMENT_STASH_SLOT_INDEX_MAX, PLAYER_INVENTORY_BASE_SLOTS } from "@the-mammoth/schemas";
import type { MammothPopulatedItem } from "./inventoryDragDropTypes";
import { apartmentStashSlotCount } from "./apartmentStashInventoryRules";
import { getMammothItemDef } from "./mammothItemCatalog";

export const MAMMOTH_HOTBAR_SLOTS = 6;
export const MAMMOTH_INVENTORY_SLOTS = PLAYER_INVENTORY_BASE_SLOTS;
/** Legacy max — prefer {@link apartmentStashSlotCount} per furniture type. */
export const MAMMOTH_STASH_SLOTS = APARTMENT_STASH_SLOT_INDEX_MAX;

export function populateMammothInventoryItem(row: InventoryItem): MammothPopulatedItem | null {
  const def = getMammothItemDef(row.defId);
  if (!def) return null;
  return { instance: row, def };
}

function buildSlots(conn: DbConnection | null, owner: Identity | null) {
  const hotbar: Array<MammothPopulatedItem | null> = Array.from(
    { length: MAMMOTH_HOTBAR_SLOTS },
    () => null,
  );
  const inventory: Array<MammothPopulatedItem | null> = Array.from(
    { length: MAMMOTH_INVENTORY_SLOTS },
    () => null,
  );
  if (!conn || !owner) {
    return { hotbar, inventory };
  }
  for (const row of conn.db.inventory_item) {
    const loc = row.location;
    if (loc.tag === "Hotbar") {
      const v = loc.value;
      if (!v.ownerId.isEqual(owner)) continue;
      const p = populateMammothInventoryItem(row as InventoryItem);
      if (p && v.slotIndex < MAMMOTH_HOTBAR_SLOTS) {
        hotbar[v.slotIndex] = p;
      }
    } else if (loc.tag === "Inventory") {
      const v = loc.value;
      if (!v.ownerId.isEqual(owner)) continue;
      const p = populateMammothInventoryItem(row as InventoryItem);
      if (p && v.slotIndex < MAMMOTH_INVENTORY_SLOTS) {
        inventory[v.slotIndex] = p;
      }
    }
  }
  return { hotbar, inventory };
}

export function useMammothInventory(conn: DbConnection | null) {
  const owner = conn?.identity ?? null;
  const [ver, setVer] = useState(0);
  useEffect(() => {
    if (!conn) return;
    const bump = () => setVer((v) => v + 1);
    conn.db.inventory_item.onInsert(bump);
    conn.db.inventory_item.onUpdate(bump);
    conn.db.inventory_item.onDelete(bump);
    return () => {
      conn.db.inventory_item.removeOnInsert(bump);
      conn.db.inventory_item.removeOnUpdate(bump);
      conn.db.inventory_item.removeOnDelete(bump);
    };
  }, [conn]);

  return useMemo(() => {
    void ver;
    return buildSlots(conn, owner);
  }, [conn, owner, ver]);
}

export function useMammothStash(
  conn: DbConnection | null,
  stashKey: string | null,
  stashKind: ApartmentStashKind | null,
) {
  const slotCount = stashKind ? apartmentStashSlotCount(stashKind) : MAMMOTH_STASH_SLOTS;
  const [ver, setVer] = useState(0);
  useEffect(() => {
    if (!conn) return;
    const bump = () => setVer((v) => v + 1);
    conn.db.inventory_item.onInsert(bump);
    conn.db.inventory_item.onUpdate(bump);
    conn.db.inventory_item.onDelete(bump);
    return () => {
      conn.db.inventory_item.removeOnInsert(bump);
      conn.db.inventory_item.removeOnUpdate(bump);
      conn.db.inventory_item.removeOnDelete(bump);
    };
  }, [conn]);

  return useMemo(() => {
    void ver;
    const stash: Array<MammothPopulatedItem | null> = Array.from({ length: slotCount }, () => null);
    if (!conn || !stashKey) return stash;
    const resolveDecor = apartmentDecorStashKindResolver(conn);
    for (const row of conn.db.inventory_item) {
      const loc = row.location;
      if (loc.tag !== "Stash") continue;
      const v = loc.value;
      if (!apartmentStashKeyMatchesRow(stashKey, v.unitKey, resolveDecor)) continue;
      const p = populateMammothInventoryItem(row as InventoryItem);
      if (p && v.slotIndex < slotCount) {
        stash[v.slotIndex] = p;
      }
    }
    return stash;
  }, [conn, stashKey, slotCount, ver]);
}

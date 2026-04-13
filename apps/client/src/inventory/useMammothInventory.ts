import { useEffect, useMemo, useState } from "react";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../module_bindings";
import type { InventoryItem } from "../module_bindings/types";
import type { MammothPopulatedItem } from "./inventoryDragDropTypes";
import { getMammothItemDef } from "./mammothItemCatalog";

const HOTBAR_SLOTS = 6;
const INV_SLOTS = 24;

function populate(row: InventoryItem): MammothPopulatedItem | null {
  const def = getMammothItemDef(row.defId);
  if (!def) return null;
  return { instance: row, def };
}

function buildSlots(conn: DbConnection | null, owner: Identity | null) {
  const hotbar: Array<MammothPopulatedItem | null> = Array.from(
    { length: HOTBAR_SLOTS },
    () => null,
  );
  const inventory: Array<MammothPopulatedItem | null> = Array.from(
    { length: INV_SLOTS },
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
      const p = populate(row as InventoryItem);
      if (p && v.slotIndex < HOTBAR_SLOTS) {
        hotbar[v.slotIndex] = p;
      }
    } else if (loc.tag === "Inventory") {
      const v = loc.value;
      if (!v.ownerId.isEqual(owner)) continue;
      const p = populate(row as InventoryItem);
      if (p && v.slotIndex < INV_SLOTS) {
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

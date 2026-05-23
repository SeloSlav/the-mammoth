import {
  BALCONY_GROW_FERTILIZER_DEF_ID,
  BALCONY_GROW_FERTILIZER_STASH_SLOT,
  parseBalconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../module_bindings";
import type {
  BalconyGrowLight,
  BalconyGrowPlant,
  BalconyGrowTray,
  BalconyWaterPatch,
} from "../module_bindings/types";

export type BalconyGrowOpUnitState = {
  trays: BalconyGrowTray[];
  plants: BalconyGrowPlant[];
  light: BalconyGrowLight | null;
  patches: BalconyWaterPatch[];
  /** trayId → true when stash slot 0 holds balcony-grow-substrate */
  traysWithSubstrate: ReadonlySet<string>;
};

const EMPTY_GROW_STATE: BalconyGrowOpUnitState = {
  trays: [],
  plants: [],
  light: null,
  patches: [],
  traysWithSubstrate: new Set(),
};

function collectForUnit<T extends { unitKey: string }>(
  rows: Iterable<T>,
  unitKey: string | null,
): T[] {
  if (!unitKey) return [];
  const out: T[] = [];
  for (const r of rows) {
    if (r.unitKey === unitKey) out.push(r);
  }
  return out;
}

/** One inventory pass — mirrors server `fertilizer_present` (stash slot 0 + substrate def). */
export function collectGrowTraySubstrateTrayIds(
  conn: DbConnection,
  unitKey: string,
): Set<string> {
  const out = new Set<string>();
  for (const row of conn.db.inventory_item) {
    if (row.location.tag !== "Stash") continue;
    if (row.defId !== BALCONY_GROW_FERTILIZER_DEF_ID) continue;
    if (Number(row.location.value.slotIndex) !== BALCONY_GROW_FERTILIZER_STASH_SLOT) continue;
    const parsed = parseBalconyGrowTrayStashKey(row.location.value.unitKey);
    if (!parsed || parsed.unitKey !== unitKey) continue;
    out.add(parsed.trayId);
  }
  return out;
}

export function readBalconyGrowOpUnitState(
  conn: DbConnection,
  unitKey: string | null,
): BalconyGrowOpUnitState {
  if (!unitKey) {
    return EMPTY_GROW_STATE;
  }
  const trays = collectForUnit(conn.db.balcony_grow_tray, unitKey);
  const plants = collectForUnit(conn.db.balcony_grow_plant, unitKey);
  const patches = collectForUnit(conn.db.balcony_water_patch, unitKey);
  let light: BalconyGrowLight | null = null;
  for (const row of conn.db.balcony_grow_light) {
    if (row.unitKey === unitKey) {
      light = row;
      break;
    }
  }
  return {
    trays,
    plants,
    light,
    patches,
    traysWithSubstrate: collectGrowTraySubstrateTrayIds(conn, unitKey),
  };
}

export function subscribeBalconyGrowOpTables(conn: DbConnection, bump: () => void): () => void {
  conn.db.balcony_grow_tray.onInsert(bump);
  conn.db.balcony_grow_tray.onUpdate(bump);
  conn.db.balcony_grow_tray.onDelete(bump);
  conn.db.balcony_grow_plant.onInsert(bump);
  conn.db.balcony_grow_plant.onUpdate(bump);
  conn.db.balcony_grow_plant.onDelete(bump);
  conn.db.balcony_grow_light.onInsert(bump);
  conn.db.balcony_grow_light.onUpdate(bump);
  conn.db.balcony_grow_light.onDelete(bump);
  conn.db.balcony_water_patch.onInsert(bump);
  conn.db.balcony_water_patch.onUpdate(bump);
  conn.db.balcony_water_patch.onDelete(bump);
  conn.db.inventory_item.onInsert(bump);
  conn.db.inventory_item.onUpdate(bump);
  conn.db.inventory_item.onDelete(bump);
  return () => {
    conn.db.balcony_grow_tray.removeOnInsert(bump);
    conn.db.balcony_grow_tray.removeOnUpdate(bump);
    conn.db.balcony_grow_tray.removeOnDelete(bump);
    conn.db.balcony_grow_plant.removeOnInsert(bump);
    conn.db.balcony_grow_plant.removeOnUpdate(bump);
    conn.db.balcony_grow_plant.removeOnDelete(bump);
    conn.db.balcony_grow_light.removeOnInsert(bump);
    conn.db.balcony_grow_light.removeOnUpdate(bump);
    conn.db.balcony_grow_light.removeOnDelete(bump);
    conn.db.balcony_water_patch.removeOnInsert(bump);
    conn.db.balcony_water_patch.removeOnUpdate(bump);
    conn.db.balcony_water_patch.removeOnDelete(bump);
    conn.db.inventory_item.removeOnInsert(bump);
    conn.db.inventory_item.removeOnUpdate(bump);
    conn.db.inventory_item.removeOnDelete(bump);
  };
}

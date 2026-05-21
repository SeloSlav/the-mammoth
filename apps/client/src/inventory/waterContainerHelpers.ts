import type { DbConnection } from "../module_bindings";
import type { MammothItemDef, MammothWaterContainer } from "./mammothItemCatalogTypes";

/** Keep in sync with `apps/server/src/water_container.rs`. */
export const APARTMENT_WATER_TANK_CAPACITY_L = 20;

export function normalizeWaterContainer(raw?: {
  capacityLiters?: number;
  sipLiters?: number;
  hydrationPerLiter?: number;
} | null): MammothWaterContainer | null {
  if (!raw) return null;
  const capacityLiters = raw.capacityLiters ?? 0;
  const sipLiters = raw.sipLiters ?? 0;
  const hydrationPerLiter = raw.hydrationPerLiter ?? 0;
  if (!(capacityLiters > 0 && sipLiters > 0 && hydrationPerLiter > 0)) return null;
  return { capacityLiters, sipLiters, hydrationPerLiter };
}

export function mammothItemDefIsWaterContainer(
  def: MammothItemDef | undefined,
): def is MammothItemDef & { waterContainer: MammothWaterContainer } {
  return def?.waterContainer != null;
}

/** Hotbar left-click drink for reusable bottles (server keeps the item row). */
export function mammothItemDefSupportsHotbarWaterDrink(def: MammothItemDef | undefined): boolean {
  return mammothItemDefIsWaterContainer(def);
}

/** Instant consumable or reusable water bottle sip. */
export function mammothItemDefSupportsHotbarUseAction(def: MammothItemDef | undefined): boolean {
  if (!def) return false;
  if (def.category === "consumable" && def.consumeOnUse !== null) return true;
  return mammothItemDefSupportsHotbarWaterDrink(def);
}

export function waterBottleFillLiters(
  conn: DbConnection | null,
  itemInstanceId: bigint | number,
): number | null {
  if (!conn) return null;
  const id = typeof itemInstanceId === "bigint" ? itemInstanceId : BigInt(itemInstanceId);
  for (const row of conn.db.water_bottle_fill) {
    if (row.itemInstanceId === id) {
      return Math.max(0, row.waterLiters);
    }
  }
  return null;
}

export function waterBottleFillFraction(
  conn: DbConnection | null,
  itemInstanceId: bigint | number,
  capacityLiters: number,
): number {
  if (!(capacityLiters > 0)) return 0;
  const liters = waterBottleFillLiters(conn, itemInstanceId);
  if (liters == null) return 1;
  return Math.min(1, Math.max(0, liters / capacityLiters));
}

export function apartmentWaterTankLiters(conn: DbConnection | null, unitKey: string): number {
  if (!conn) return 0;
  for (const row of conn.db.apartment_water_tank) {
    if (row.unitKey === unitKey) {
      return Math.max(0, row.waterLiters);
    }
  }
  return 0;
}

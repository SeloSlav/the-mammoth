import { useEffect, useMemo, useState } from "react";
import type { DbConnection } from "../module_bindings";

/** Subscribe to `water_bottle_fill` rows for hotbar / stash UI. */
export function useWaterBottleFillVersion(conn: DbConnection | null): number {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    if (!conn) return;
    const bump = () => setVer((v) => v + 1);
    conn.db.water_bottle_fill.onInsert(bump);
    conn.db.water_bottle_fill.onUpdate(bump);
    conn.db.water_bottle_fill.onDelete(bump);
    return () => {
      conn.db.water_bottle_fill.removeOnInsert(bump);
      conn.db.water_bottle_fill.removeOnUpdate(bump);
      conn.db.water_bottle_fill.removeOnDelete(bump);
    };
  }, [conn]);
  return ver;
}

export function useApartmentWaterTankLiters(
  conn: DbConnection | null,
  unitKey: string | null,
): number {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    if (!conn) return;
    const bump = () => setVer((v) => v + 1);
    conn.db.apartment_water_tank.onInsert(bump);
    conn.db.apartment_water_tank.onUpdate(bump);
    conn.db.apartment_water_tank.onDelete(bump);
    return () => {
      conn.db.apartment_water_tank.removeOnInsert(bump);
      conn.db.apartment_water_tank.removeOnUpdate(bump);
      conn.db.apartment_water_tank.removeOnDelete(bump);
    };
  }, [conn]);

  return useMemo(() => {
    void ver;
    if (!conn || !unitKey) return 0;
    for (const row of conn.db.apartment_water_tank) {
      if (row.unitKey === unitKey) {
        return Math.max(0, row.waterLiters);
      }
    }
    return 0;
  }, [conn, unitKey, ver]);
}

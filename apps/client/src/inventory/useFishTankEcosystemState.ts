import { useEffect, useMemo, useState } from "react";
import {
  FISH_TANK_ECOSYSTEM_WATER_CAPACITY_L,
  FISH_TANK_FILTER_HEALTH_START,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../module_bindings";
import { parseApartmentStashKeyFull } from "../game/fpApartment/fpApartmentStashKey";

export type FishTankEcosystemSnapshot = {
  tankDecorId: bigint;
  waterLiters: number;
  filterHealth: number;
  linked: boolean;
};

export function useFishTankEcosystemForFilterStash(
  conn: DbConnection,
  stashKey: string | null,
): FishTankEcosystemSnapshot | null {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    const bump = () => setVer((v) => v + 1);
    conn.db.fish_tank_filter_link.onInsert(bump);
    conn.db.fish_tank_filter_link.onUpdate(bump);
    conn.db.fish_tank_filter_link.onDelete(bump);
    conn.db.fish_tank_ecosystem.onInsert(bump);
    conn.db.fish_tank_ecosystem.onUpdate(bump);
    conn.db.fish_tank_ecosystem.onDelete(bump);
    return () => {
      conn.db.fish_tank_filter_link.removeOnInsert(bump);
      conn.db.fish_tank_filter_link.removeOnUpdate(bump);
      conn.db.fish_tank_filter_link.removeOnDelete(bump);
      conn.db.fish_tank_ecosystem.removeOnInsert(bump);
      conn.db.fish_tank_ecosystem.removeOnUpdate(bump);
      conn.db.fish_tank_ecosystem.removeOnDelete(bump);
    };
  }, [conn]);

  return useMemo(() => {
    void ver;
    if (!stashKey) return null;
    const parsed = parseApartmentStashKeyFull(stashKey);
    if (parsed.tag !== "decor") return null;
    const filterDecorId = parsed.decorId;

    let linkTankId: bigint | null = null;
    for (const row of conn.db.fish_tank_filter_link) {
      if (row.filterDecorId === filterDecorId) {
        linkTankId = row.tankDecorId;
        break;
      }
    }
    if (linkTankId === null) {
      return {
        tankDecorId: 0n,
        waterLiters: 0,
        filterHealth: 0,
        linked: false,
      };
    }
    let ecoWater = 0;
    let ecoHealth: number = FISH_TANK_FILTER_HEALTH_START;
    for (const row of conn.db.fish_tank_ecosystem) {
      if (row.tankDecorId === linkTankId) {
        ecoWater = Math.max(0, row.waterLiters);
        ecoHealth = row.filterHealth;
        break;
      }
    }
    return {
      tankDecorId: linkTankId,
      waterLiters: ecoWater,
      filterHealth: ecoHealth,
      linked: true,
    };
  }, [conn, stashKey, ver]);
}

export { FISH_TANK_ECOSYSTEM_WATER_CAPACITY_L };

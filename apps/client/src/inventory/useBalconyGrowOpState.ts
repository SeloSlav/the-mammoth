import { useEffect, useMemo, useState } from "react";
import type { DbConnection } from "../module_bindings";
import {
  readBalconyGrowOpUnitState,
  subscribeBalconyGrowOpTables,
  type BalconyGrowOpUnitState,
} from "./balconyGrowOpState.js";

export type { BalconyGrowOpUnitState };

export function useBalconyGrowOpState(
  conn: DbConnection | null,
  unitKey: string | null,
): BalconyGrowOpUnitState {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!conn) return;
    return subscribeBalconyGrowOpTables(conn, () => setTick((n) => n + 1));
  }, [conn]);

  return useMemo(() => {
    void tick;
    if (!conn) {
      return { trays: [], plants: [], light: null, patches: [], traysWithSubstrate: new Set() };
    }
    return readBalconyGrowOpUnitState(conn, unitKey);
  }, [conn, unitKey, tick]);
}

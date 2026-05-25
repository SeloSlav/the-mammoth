import { useEffect, useState } from "react";
import type { DbConnection } from "../module_bindings";
import {
  readApartmentUnitUtilities,
  subscribeApartmentUnitUtilities,
  type ApartmentUnitUtilitiesSnapshot,
} from "../game/fpApartment/fpApartmentUnitUtilities";

export function useApartmentUnitUtilities(
  conn: DbConnection | null,
  unitKey: string | null,
): ApartmentUnitUtilitiesSnapshot {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!conn) return;
    return subscribeApartmentUnitUtilities(conn, () => setTick((t) => t + 1));
  }, [conn]);
  void tick;
  return conn ? readApartmentUnitUtilities(conn, unitKey) : {
    powerOn: true,
    waterTankOk: true,
    powerRestoreAfterMinutes: 0,
    waterRestoreAfterMinutes: 0,
  };
}

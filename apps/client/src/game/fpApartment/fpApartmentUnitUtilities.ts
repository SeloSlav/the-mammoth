import type { DbConnection } from "../../module_bindings";
import {
  apartmentUnitPowerOn,
  apartmentUnitWaterTankOk,
} from "@the-mammoth/schemas";

export type ApartmentUnitUtilitiesSnapshot = {
  powerOn: boolean;
  waterTankOk: boolean;
  powerRestoreAfterMinutes: number;
  waterRestoreAfterMinutes: number;
};

const DEFAULT_UTILITIES: ApartmentUnitUtilitiesSnapshot = {
  powerOn: true,
  waterTankOk: true,
  powerRestoreAfterMinutes: 0,
  waterRestoreAfterMinutes: 0,
};

export function readApartmentUnitUtilities(
  conn: DbConnection,
  unitKey: string | null,
): ApartmentUnitUtilitiesSnapshot {
  if (!unitKey) return DEFAULT_UTILITIES;
  for (const row of conn.db.apartment_unit_utilities) {
    if (row.unitKey !== unitKey) continue;
    return {
      powerOn: apartmentUnitPowerOn(row.powerOn),
      waterTankOk: apartmentUnitWaterTankOk(row.waterTankOk),
      powerRestoreAfterMinutes: row.powerRestoreAfterMinutes,
      waterRestoreAfterMinutes: row.waterRestoreAfterMinutes,
    };
  }
  return DEFAULT_UTILITIES;
}

export function subscribeApartmentUnitUtilities(
  conn: DbConnection,
  bump: () => void,
): () => void {
  conn.db.apartment_unit_utilities.onInsert(bump);
  conn.db.apartment_unit_utilities.onUpdate(bump);
  conn.db.apartment_unit_utilities.onDelete(bump);
  return () => {
    conn.db.apartment_unit_utilities.removeOnInsert(bump);
    conn.db.apartment_unit_utilities.removeOnUpdate(bump);
    conn.db.apartment_unit_utilities.removeOnDelete(bump);
  };
}

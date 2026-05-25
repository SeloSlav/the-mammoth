/**
 * Apartment utility simulation — power outages and water-tank reliability.
 * Keep in sync with `apps/server/src/apartment_utilities.rs`.
 */

/** Basis points (0–10000) — 500 = 5%. */
export const APARTMENT_POWER_OUTAGE_CHANCE_BP = 500 as const;

/** Given a power outage today, chance building power returns before sleep. */
export const APARTMENT_POWER_SAME_DAY_RESTORE_CHANCE_BP = 2800 as const;

/** Wake refill lands below capacity (leaky header / low pressure). */
export const APARTMENT_WATER_PARTIAL_REFILL_CHANCE_BP = 700 as const;

/** Wake with tank broken — sleep refill skipped until repaired. */
export const APARTMENT_WATER_TANK_BREAK_CHANCE_BP = 450 as const;

/** Given a broken tank, chance mains repair crew fixes it same day. */
export const APARTMENT_WATER_SAME_DAY_REPAIR_CHANCE_BP = 3200 as const;

/** Partial overnight refill range (liters). */
export const APARTMENT_WATER_PARTIAL_REFILL_MIN_L = 5 as const;
export const APARTMENT_WATER_PARTIAL_REFILL_MAX_L = 14 as const;

/** Broken-tank overnight refill cap (liters). */
export const APARTMENT_WATER_BROKEN_REFILL_MAX_L = 8 as const;

/** Earliest same-day power restore after wake (minutes since midnight). */
export const APARTMENT_POWER_RESTORE_EARLIEST_MINUTES = 480 as const; // 08:00

/** Latest same-day power restore before typical sleep window. */
export const APARTMENT_POWER_RESTORE_LATEST_MINUTES = 1200 as const; // 20:00

/** Same-day water repair window. */
export const APARTMENT_WATER_REPAIR_EARLIEST_MINUTES = 420 as const; // 07:00
export const APARTMENT_WATER_REPAIR_LATEST_MINUTES = 1140 as const; // 19:00

export function apartmentUnitPowerOn(powerOn: number): boolean {
  return powerOn !== 0;
}

export function apartmentUnitWaterTankOk(waterTankOk: number): boolean {
  return waterTankOk !== 0;
}

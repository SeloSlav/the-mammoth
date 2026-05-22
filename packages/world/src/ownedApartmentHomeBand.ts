import type { BuildingDoc } from "@the-mammoth/schemas";
import { TYPICAL_FLOOR_DOC_ID } from "./buildingStairShafts.js";
import { maxBuildingLevelIndex } from "./elevatorShaftLayout.js";

/**
 * Canonical roof “home slot” apartments on {@link TYPICAL_FLOOR_DOC_ID}.
 * Keep `HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID` aligned with
 * **`HOME_BAND_UNIT_IDS[0]`** in `apps/server/src/apartments.rs`.
 */
export const HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID = "unit_e_003" as const;

/**
 * Unit key for the player-owned fallback layout ({@link HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID})
 * on the typical plate at the building’s roof band level — matches editor bootstrap and disk saves.
 */
export function ownedDefaultApartmentUnitKey(building: BuildingDoc): string {
  return `${TYPICAL_FLOOR_DOC_ID}|${Math.max(1, maxBuildingLevelIndex(building))}|${HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID}`;
}

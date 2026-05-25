/**
 * Fish-tank filter unit — maintenance stash + link to a main fish tank decor instance.
 * Keep stash rules in sync with `apps/server/src/apartment_stash_rules.rs` and sim logic
 * with `apps/server/src/fish_tank_filter.rs`.
 */

import type { ApartmentStashItemCategory } from "./apartmentStashRules.js";

export const APARTMENT_STASH_KIND_FISH_TANK_FILTER = "fish_tank_filter" as const;

/** Authored filter HOB/canister mesh — not the apartment drinking-water ceramic filter. */
export const OWNED_APARTMENT_MODEL_FISH_TANK_FILTER =
  "static/models/objects/fish-tank-filter.glb" as const;

/** Default filter row in `owned_apartment_builtins.json`. */
export const AUTHORED_FISH_TANK_FILTER_PLACED_ID =
  "83642433-7188-42b5-98ad-887456f39573" as const;

/** Default main tank row id the reference filter links to. */
export const AUTHORED_FISH_TANK_PLACED_ID = "5399ea91-6ad6-4c22-9e44-6b0b3f2f5b58" as const;

/** Spare sponge cartridge before install. */
export const APARTMENT_FISH_TANK_FILTER_MAINTENANCE_SLOT = 0 as const;

/** Deposited water bottle for top-off and rinse actions (mirrors apartment water tank). */
export const APARTMENT_FISH_TANK_FILTER_WATER_BOTTLE_SLOT = 1 as const;

/** Replaceable HOB foam cartridge — extraction loot (floor 5 pet aisle, maintenance decks). */
export const FISH_TANK_FILTER_PATCH_DEF_ID = "fish-filter-sponge" as const;

export const APARTMENT_FISH_TANK_FILTER_CARTRIDGE_DEF_IDS = [
  FISH_TANK_FILTER_PATCH_DEF_ID,
] as const;

export const APARTMENT_FISH_TANK_FILTER_WATER_BOTTLE_DEF_ID = "water-bottle" as const;

export function isApartmentFishTankFilterModelRelPath(modelRelPath: string): boolean {
  const norm = modelRelPath.trim().replace(/^\/+/u, "").toLowerCase();
  return norm.endsWith("fish-tank-filter.glb");
}

export function apartmentFishTankFilterAcceptsDefIdAtSlot(
  slotIndex: number,
  defId: string,
  _category: ApartmentStashItemCategory,
): boolean {
  if (slotIndex === APARTMENT_FISH_TANK_FILTER_MAINTENANCE_SLOT) {
    return (APARTMENT_FISH_TANK_FILTER_CARTRIDGE_DEF_IDS as readonly string[]).includes(defId);
  }
  if (slotIndex === APARTMENT_FISH_TANK_FILTER_WATER_BOTTLE_SLOT) {
    return defId === APARTMENT_FISH_TANK_FILTER_WATER_BOTTLE_DEF_ID;
  }
  return false;
}

/** Whether this def id may enter any fish-filter slot (used when slot is unknown). */
export function apartmentFishTankFilterAcceptsDefId(
  defId: string,
  category: ApartmentStashItemCategory,
): boolean {
  return (
    apartmentFishTankFilterAcceptsDefIdAtSlot(
      APARTMENT_FISH_TANK_FILTER_MAINTENANCE_SLOT,
      defId,
      category,
    ) ||
    apartmentFishTankFilterAcceptsDefIdAtSlot(
      APARTMENT_FISH_TANK_FILTER_WATER_BOTTLE_SLOT,
      defId,
      category,
    )
  );
}

export function apartmentFishTankFilterPreferredSlotForDefId(defId: string): number | null {
  if ((APARTMENT_FISH_TANK_FILTER_CARTRIDGE_DEF_IDS as readonly string[]).includes(defId)) {
    return APARTMENT_FISH_TANK_FILTER_MAINTENANCE_SLOT;
  }
  if (defId === APARTMENT_FISH_TANK_FILTER_WATER_BOTTLE_DEF_ID) {
    return APARTMENT_FISH_TANK_FILTER_WATER_BOTTLE_SLOT;
  }
  return null;
}

/** Aquarium water volume (liters) — separate from the kitchen water tank. */
export const FISH_TANK_ECOSYSTEM_WATER_CAPACITY_L = 5 as const;
export const FISH_TANK_ECOSYSTEM_WATER_START_L = 4 as const;

/** Filter health 0–100; degrades each slept night when the pump runs. */
export const FISH_TANK_FILTER_HEALTH_START = 100 as const;

/** Nightly loss when tank water is healthy — ~7 slept nights from full to spent. */
export const FISH_TANK_FILTER_OVERNIGHT_LOSS_OK = 14 as const;

/** Nightly loss when tank water is low — clogs the sponge faster. */
export const FISH_TANK_FILTER_OVERNIGHT_LOSS_STRESSED = 20 as const;

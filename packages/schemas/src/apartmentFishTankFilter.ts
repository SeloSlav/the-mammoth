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

/** Single maintenance slot — spare sponge cartridge before install. */
export const APARTMENT_FISH_TANK_FILTER_MAINTENANCE_SLOT = 0 as const;

/** Replaceable HOB foam cartridge — extraction loot (floor 5 pet aisle, maintenance decks). */
export const FISH_TANK_FILTER_PATCH_DEF_ID = "fish-filter-sponge" as const;

export const APARTMENT_FISH_TANK_FILTER_ALLOWED_DEF_IDS = [
  FISH_TANK_FILTER_PATCH_DEF_ID,
] as const;

export function isApartmentFishTankFilterModelRelPath(modelRelPath: string): boolean {
  const norm = modelRelPath.trim().replace(/^\/+/u, "").toLowerCase();
  return norm.endsWith("fish-tank-filter.glb");
}

export function apartmentFishTankFilterAcceptsDefId(
  defId: string,
  _category: ApartmentStashItemCategory,
): boolean {
  return (APARTMENT_FISH_TANK_FILTER_ALLOWED_DEF_IDS as readonly string[]).includes(defId);
}

/** Aquarium water volume (liters) — separate from the kitchen water tank. */
export const FISH_TANK_ECOSYSTEM_WATER_CAPACITY_L = 5 as const;
export const FISH_TANK_ECOSYSTEM_WATER_START_L = 4 as const;

/** Filter health 0–100; degrades each slept night when the pump runs. */
export const FISH_TANK_FILTER_HEALTH_START = 85 as const;

/**
 * Fish tank feed → overnight compost loop. Keep stash rules in sync with
 * `apps/server/src/apartment_stash_rules.rs` and yield logic with `apps/server/src/fish_tank.rs`.
 */

import { BALCONY_GROW_FERTILIZER_DEF_ID } from "./balconyGrowOp.js";
import type { ApartmentStashItemCategory } from "./apartmentStashRules.js";

export const APARTMENT_STASH_KIND_FISH_TANK = "fish_tank" as const;

/** Single feed slot in each fish-tank stash (mirrors grow-tray fertilizer slot pattern). */
export const APARTMENT_FISH_TANK_FEED_SLOT = 0 as const;

/** Consumables that are not fish food — block from feed slot. */
export const APARTMENT_FISH_TANK_FEED_BLOCKED_DEF_IDS = [
  BALCONY_GROW_FERTILIZER_DEF_ID,
  "water-bottle",
  "iodine-tablets",
  "bandage-roll",
  "caffeine-gum",
  "cigarettes",
] as const;

/** Authored main tank mesh — accessories (castle, sand) stay plain decor. */
export const OWNED_APARTMENT_MODEL_FISH_TANK = "static/models/objects/fish-tank.glb" as const;

export function isApartmentFishTankModelRelPath(modelRelPath: string): boolean {
  const norm = modelRelPath.trim().replace(/^\/+/u, "").toLowerCase();
  return norm.endsWith("fish-tank.glb");
}

/** Whether a catalog item may be placed into the fish-tank feed slot from player inventory. */
export function apartmentFishTankAcceptsFeedDefId(
  defId: string,
  category: ApartmentStashItemCategory,
): boolean {
  if ((APARTMENT_FISH_TANK_FEED_BLOCKED_DEF_IDS as readonly string[]).includes(defId)) {
    return false;
  }
  return category === "consumable";
}

import {
  effectiveOwnedApartmentPlacedKind,
  type OwnedApartmentPlacedItemKind,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import {
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_FRIDGE,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_WARDROBE,
  APARTMENT_STASH_KIND_GROW_TRAY,
  APARTMENT_STASH_KIND_WATER_TANK,
  APARTMENT_STASH_KIND_FISH_TANK,
  parseApartmentStashKeyFull,
  type ApartmentStashKind,
} from "./fpApartmentStashKey";

export function apartmentStashKindForPlacedKind(
  k: OwnedApartmentPlacedItemKind,
): ApartmentStashKind | null {
  if (k === "wardrobe") return APARTMENT_STASH_KIND_WARDROBE;
  if (k === "footlocker") return APARTMENT_STASH_KIND_FOOTLOCKER;
  if (k === "stove") return APARTMENT_STASH_KIND_STOVE;
  if (k === "fridge") return APARTMENT_STASH_KIND_FRIDGE;
  if (k === "water_tank") return APARTMENT_STASH_KIND_WATER_TANK;
  if (k === "fish_tank") return APARTMENT_STASH_KIND_FISH_TANK;
  return null;
}

/** Resolve furniture stash kind for HUD rules from a replicated stash location key. */
export function resolveApartmentStashKind(
  conn: DbConnection | null,
  stashKey: string,
): ApartmentStashKind {
  const full = parseApartmentStashKeyFull(stashKey);
  if (full.tag === "legacy") return full.stashKind;
  if (full.tag === "grow_tray") return APARTMENT_STASH_KIND_GROW_TRAY;
  if (full.tag === "bare") return APARTMENT_STASH_KIND_FOOTLOCKER;
  if (!conn) return APARTMENT_STASH_KIND_FOOTLOCKER;
  if (full.tag !== "decor") return APARTMENT_STASH_KIND_FOOTLOCKER;
  for (const row of conn.db.apartment_unit_decor) {
    if (row.unitKey !== full.unitKey || row.decorId !== full.decorId) continue;
    const sk = apartmentStashKindForPlacedKind(
      effectiveOwnedApartmentPlacedKind(row.itemKind, row.modelRelPath),
    );
    return sk ?? APARTMENT_STASH_KIND_FOOTLOCKER;
  }
  return APARTMENT_STASH_KIND_FOOTLOCKER;
}

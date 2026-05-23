/**
 * Apartment furniture stash capacity and item-category rules.
 * Keep in sync with `apps/server/src/apartment_stash_rules.rs`.
 */

import {
  APARTMENT_STASH_KIND_GROW_TRAY,
  BALCONY_GROW_FERTILIZER_DEF_ID,
} from "./balconyGrowOp.js";

export { APARTMENT_STASH_KIND_GROW_TRAY, BALCONY_GROW_FERTILIZER_DEF_ID };

export const APARTMENT_STASH_KIND_FOOTLOCKER = "footlocker" as const;
export const APARTMENT_STASH_KIND_WARDROBE = "wardrobe" as const;
export const APARTMENT_STASH_KIND_STOVE = "stove" as const;
export const APARTMENT_STASH_KIND_FRIDGE = "fridge" as const;
export const APARTMENT_STASH_KIND_WATER_TANK = "water_tank" as const;

export const APARTMENT_STASH_KINDS = [
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_WARDROBE,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_FRIDGE,
  APARTMENT_STASH_KIND_WATER_TANK,
  APARTMENT_STASH_KIND_GROW_TRAY,
] as const;

export type ApartmentStashKind = (typeof APARTMENT_STASH_KINDS)[number];

/** Catalog `category` strings — mirrors `ItemCategory` in item shards. */
export type ApartmentStashItemCategory =
  | "weapon"
  | "tool"
  | "resource"
  | "ammo"
  | "utility"
  | "placeable"
  | "consumable";

/** Hard cap for any apartment stash row index (legacy DB headroom). */
export const APARTMENT_STASH_SLOT_INDEX_MAX = 24 as const;

/** Def ids allowed in the fridge beyond consumables (reusable tools stored cold). */
export const APARTMENT_STASH_FRIDGE_EXTRA_DEF_IDS = ["water-bottle"] as const;

/** Def ids allowed in the water tank (consumable slot). */
export const APARTMENT_STASH_WATER_TANK_ALLOWED_DEF_IDS = ["water-bottle"] as const;

/** Def ids allowed in grow-tray fertilizer slot. */
export const APARTMENT_STASH_GROW_TRAY_ALLOWED_DEF_IDS = [BALCONY_GROW_FERTILIZER_DEF_ID] as const;

/** Active slot count per furniture type (indices `0 .. count - 1`). */
export const APARTMENT_STASH_SLOT_COUNT_BY_KIND: Record<ApartmentStashKind, number> = {
  [APARTMENT_STASH_KIND_FOOTLOCKER]: 24,
  [APARTMENT_STASH_KIND_WARDROBE]: 10,
  [APARTMENT_STASH_KIND_STOVE]: 3,
  [APARTMENT_STASH_KIND_FRIDGE]: 14,
  [APARTMENT_STASH_KIND_WATER_TANK]: 1,
  [APARTMENT_STASH_KIND_GROW_TRAY]: 1,
};

export function apartmentStashSlotCount(stashKind: ApartmentStashKind): number {
  return APARTMENT_STASH_SLOT_COUNT_BY_KIND[stashKind];
}

export function isApartmentStashSlotIndexValid(
  stashKind: ApartmentStashKind,
  slotIndex: number,
): boolean {
  return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < apartmentStashSlotCount(stashKind);
}

export function apartmentStashKindFromLegacySuffix(suffix: string): ApartmentStashKind | null {
  if ((APARTMENT_STASH_KINDS as readonly string[]).includes(suffix)) {
    return suffix as ApartmentStashKind;
  }
  return null;
}

/**
 * Whether a catalog item may be placed into this stash (when moving from player inventory/hotbar).
 * Items already stored in a stash may be rearranged without re-checking category.
 */
export function apartmentStashAcceptsItemCategory(
  stashKind: ApartmentStashKind,
  category: ApartmentStashItemCategory,
): boolean {
  switch (stashKind) {
    case APARTMENT_STASH_KIND_FOOTLOCKER:
      return true;
    case APARTMENT_STASH_KIND_WARDROBE:
      return (
        category === "weapon" ||
        category === "ammo" ||
        category === "tool" ||
        category === "utility"
      );
    case APARTMENT_STASH_KIND_FRIDGE:
    case APARTMENT_STASH_KIND_STOVE:
      return category === "consumable";
    case APARTMENT_STASH_KIND_WATER_TANK:
      return false;
    case APARTMENT_STASH_KIND_GROW_TRAY:
      return false;
    default:
      return false;
  }
}

/** Whether a catalog def id may enter this stash from player inventory/hotbar. */
export function apartmentStashAcceptsDefId(
  stashKind: ApartmentStashKind,
  defId: string,
  category: ApartmentStashItemCategory,
): boolean {
  if (stashKind === APARTMENT_STASH_KIND_WATER_TANK) {
    return (APARTMENT_STASH_WATER_TANK_ALLOWED_DEF_IDS as readonly string[]).includes(defId);
  }
  if (stashKind === APARTMENT_STASH_KIND_GROW_TRAY) {
    return (APARTMENT_STASH_GROW_TRAY_ALLOWED_DEF_IDS as readonly string[]).includes(defId);
  }
  if (
    stashKind === APARTMENT_STASH_KIND_FRIDGE &&
    (APARTMENT_STASH_FRIDGE_EXTRA_DEF_IDS as readonly string[]).includes(defId)
  ) {
    return true;
  }
  return apartmentStashAcceptsItemCategory(stashKind, category);
}

/** Short hint for HUD when a drop is rejected client-side. */
export function apartmentStashRejectionHint(stashKind: ApartmentStashKind): string {
  switch (stashKind) {
    case APARTMENT_STASH_KIND_WARDROBE:
      return "Wardrobe only holds weapons, ammo, tools, and utility gear.";
    case APARTMENT_STASH_KIND_FRIDGE:
      return "Fridge only holds food and consumables.";
    case APARTMENT_STASH_KIND_STOVE:
      return "Stove only holds food (for now).";
    case APARTMENT_STASH_KIND_WATER_TANK:
      return "Water tank only holds a water bottle.";
    case APARTMENT_STASH_KIND_GROW_TRAY:
      return "Grow tray only holds tray compost.";
    default:
      return "This item cannot go here.";
  }
}

export type ApartmentStashHudSection = {
  label: string;
  slotIndices: number[];
  cols: number;
};

/** Stove uses 2 burner slots + 1 oven slot; other kinds use a single grid. */
export function apartmentStashHudSections(
  stashKind: ApartmentStashKind,
): ApartmentStashHudSection[] | null {
  if (stashKind !== APARTMENT_STASH_KIND_STOVE) return null;
  return [
    { label: "Burners", slotIndices: [0, 1], cols: 2 },
    { label: "Oven", slotIndices: [2], cols: 1 },
  ];
}

/** Default grid columns when not using sectional layout. */
export function apartmentStashHudGridCols(stashKind: ApartmentStashKind): number {
  switch (stashKind) {
    case APARTMENT_STASH_KIND_STOVE:
      return 2;
    case APARTMENT_STASH_KIND_WARDROBE:
      return 5;
    case APARTMENT_STASH_KIND_FRIDGE:
      return 7;
    case APARTMENT_STASH_KIND_WATER_TANK:
      return 1;
    case APARTMENT_STASH_KIND_GROW_TRAY:
      return 1;
    default:
      return 6;
  }
}

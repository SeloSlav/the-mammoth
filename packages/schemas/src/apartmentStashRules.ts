/**
 * Apartment furniture stash capacity and item-category rules.
 * Keep in sync with `apps/server/src/apartment_stash_rules.rs`.
 */

export const APARTMENT_STASH_KIND_FOOTLOCKER = "footlocker" as const;
export const APARTMENT_STASH_KIND_WARDROBE = "wardrobe" as const;
export const APARTMENT_STASH_KIND_STOVE = "stove" as const;
export const APARTMENT_STASH_KIND_FRIDGE = "fridge" as const;

export const APARTMENT_STASH_KINDS = [
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_WARDROBE,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_FRIDGE,
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

/** Active slot count per furniture type (indices `0 .. count - 1`). */
export const APARTMENT_STASH_SLOT_COUNT_BY_KIND: Record<ApartmentStashKind, number> = {
  [APARTMENT_STASH_KIND_FOOTLOCKER]: 24,
  [APARTMENT_STASH_KIND_WARDROBE]: 10,
  [APARTMENT_STASH_KIND_STOVE]: 6,
  [APARTMENT_STASH_KIND_FRIDGE]: 14,
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
    default:
      return false;
  }
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
    default:
      return "This item cannot go here.";
  }
}

export type ApartmentStashHudSection = {
  label: string;
  slotIndices: number[];
  cols: number;
};

/** Stove uses 4 burner slots + 2 oven slots; other kinds use a single grid. */
export function apartmentStashHudSections(
  stashKind: ApartmentStashKind,
): ApartmentStashHudSection[] | null {
  if (stashKind !== APARTMENT_STASH_KIND_STOVE) return null;
  return [
    { label: "Burners", slotIndices: [0, 1, 2, 3], cols: 4 },
    { label: "Oven", slotIndices: [4, 5], cols: 2 },
  ];
}

/** Default grid columns when not using sectional layout. */
export function apartmentStashHudGridCols(stashKind: ApartmentStashKind): number {
  switch (stashKind) {
    case APARTMENT_STASH_KIND_STOVE:
      return 4;
    case APARTMENT_STASH_KIND_WARDROBE:
      return 5;
    case APARTMENT_STASH_KIND_FRIDGE:
      return 7;
    default:
      return 6;
  }
}

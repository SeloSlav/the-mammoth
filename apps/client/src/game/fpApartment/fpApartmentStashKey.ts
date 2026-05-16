export const APARTMENT_STASH_KIND_FOOTLOCKER = "footlocker";
export const APARTMENT_STASH_KIND_WARDROBE = "wardrobe";
export const APARTMENT_STASH_KIND_STOVE = "stove";

export type ApartmentStashKind =
  | typeof APARTMENT_STASH_KIND_FOOTLOCKER
  | typeof APARTMENT_STASH_KIND_WARDROBE
  | typeof APARTMENT_STASH_KIND_STOVE;

const APARTMENT_STASH_KEY_SEP = "#";

export function apartmentStashKey(unitKey: string, stashKind: ApartmentStashKind): string {
  return `${unitKey}${APARTMENT_STASH_KEY_SEP}${stashKind}`;
}

export function parseApartmentStashKey(stashKey: string): {
  unitKey: string;
  stashKind: ApartmentStashKind;
} {
  const split = stashKey.lastIndexOf(APARTMENT_STASH_KEY_SEP);
  if (split > 0) {
    const unitKey = stashKey.slice(0, split);
    const stashKind = stashKey.slice(split + APARTMENT_STASH_KEY_SEP.length);
    if (
      stashKind === APARTMENT_STASH_KIND_FOOTLOCKER ||
      stashKind === APARTMENT_STASH_KIND_WARDROBE ||
      stashKind === APARTMENT_STASH_KIND_STOVE
    ) {
      return { unitKey, stashKind };
    }
  }
  // Legacy shared stash rows/keying become the footlocker stash.
  return { unitKey: stashKey, stashKind: APARTMENT_STASH_KIND_FOOTLOCKER };
}

export function apartmentStashLabel(stashKind: ApartmentStashKind): string {
  switch (stashKind) {
    case APARTMENT_STASH_KIND_WARDROBE:
      return "wardrobe";
    case APARTMENT_STASH_KIND_STOVE:
      return "stove";
    default:
      return "footlocker";
  }
}

export function apartmentStashKeyMatchesRow(stashKey: string, storedUnitKey: string): boolean {
  if (storedUnitKey === stashKey) return true;
  const parsed = parseApartmentStashKey(stashKey);
  return parsed.stashKind === APARTMENT_STASH_KIND_FOOTLOCKER && storedUnitKey === parsed.unitKey;
}

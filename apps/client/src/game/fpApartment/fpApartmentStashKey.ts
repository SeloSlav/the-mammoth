export const APARTMENT_STASH_KIND_FOOTLOCKER = "footlocker";
export const APARTMENT_STASH_KIND_WARDROBE = "wardrobe";
export const APARTMENT_STASH_KIND_STOVE = "stove";
export const APARTMENT_STASH_KIND_FRIDGE = "fridge";
export const APARTMENT_STASH_KIND_WATER_TANK = "water_tank";

export type ApartmentStashKind =
  | typeof APARTMENT_STASH_KIND_FOOTLOCKER
  | typeof APARTMENT_STASH_KIND_WARDROBE
  | typeof APARTMENT_STASH_KIND_STOVE
  | typeof APARTMENT_STASH_KIND_FRIDGE
  | typeof APARTMENT_STASH_KIND_WATER_TANK;

const APARTMENT_STASH_KEY_SEP = "#";

/** Per replica `ApartmentUnitDecor` row — must match `inventory_models::apartment_stash_key_decor`. */
export function apartmentStashKeyDecor(unitKey: string, decorId: bigint): string {
  return `${unitKey}${APARTMENT_STASH_KEY_SEP}d${decorId.toString()}`;
}

export type ParsedApartmentStashKey =
  /** Legacy DB row: exact `unit_key` with no `#` suffix (footlocker-only). */
  | { tag: "bare"; unitKey: string }
  | { tag: "legacy"; unitKey: string; stashKind: ApartmentStashKind }
  | { tag: "decor"; unitKey: string; decorId: bigint };

/** Full parse — supports `unitKey#wardrobe`, bare `unitKey` (footlocker), and `unitKey#d7`. */
export function parseApartmentStashKeyFull(stashKey: string): ParsedApartmentStashKey {
  const split = stashKey.lastIndexOf(APARTMENT_STASH_KEY_SEP);
  if (split > 0) {
    const unitKey = stashKey.slice(0, split);
    const tail = stashKey.slice(split + APARTMENT_STASH_KEY_SEP.length);
    const decorMatch = /^d(\d+)$/u.exec(tail);
    if (decorMatch?.[1]) {
      return { tag: "decor", unitKey, decorId: BigInt(decorMatch[1]) };
    }
    if (
      tail === APARTMENT_STASH_KIND_FOOTLOCKER ||
      tail === APARTMENT_STASH_KIND_WARDROBE ||
      tail === APARTMENT_STASH_KIND_STOVE ||
      tail === APARTMENT_STASH_KIND_FRIDGE ||
      tail === APARTMENT_STASH_KIND_WATER_TANK
    ) {
      return { tag: "legacy", unitKey, stashKind: tail as ApartmentStashKind };
    }
  }
  return { tag: "bare", unitKey: stashKey };
}

export function apartmentStashKey(unitKey: string, stashKind: ApartmentStashKind): string {
  return `${unitKey}${APARTMENT_STASH_KEY_SEP}${stashKind}`;
}

/** @deprecated Prefer {@link parseApartmentStashKeyFull} for decor-instance keys. */
export function parseApartmentStashKey(stashKey: string): {
  unitKey: string;
  stashKind: ApartmentStashKind;
} {
  const f = parseApartmentStashKeyFull(stashKey);
  if (f.tag === "decor") {
    return { unitKey: f.unitKey, stashKind: APARTMENT_STASH_KIND_FOOTLOCKER };
  }
  if (f.tag === "bare") {
    return { unitKey: f.unitKey, stashKind: APARTMENT_STASH_KIND_FOOTLOCKER };
  }
  return { unitKey: f.unitKey, stashKind: f.stashKind };
}

export function apartmentStashLabel(stashKind: ApartmentStashKind): string {
  switch (stashKind) {
    case APARTMENT_STASH_KIND_WARDROBE:
      return "wardrobe";
    case APARTMENT_STASH_KIND_STOVE:
      return "stove";
    case APARTMENT_STASH_KIND_FRIDGE:
      return "fridge";
    case APARTMENT_STASH_KIND_WATER_TANK:
      return "water tank";
    default:
      return "footlocker";
  }
}

/** Client mirror of server `stash_location_matches` argument order: `(stored, requested)`. */
function stashLocationMatches(stored: string, requested: string): boolean {
  if (stored === requested) return true;
  const sa = parseApartmentStashKeyFull(stored);
  const sb = parseApartmentStashKeyFull(requested);
  if (sa.tag === "decor" && sb.tag === "decor") {
    return sa.unitKey === sb.unitKey && sa.decorId === sb.decorId;
  }
  if (sa.tag === "legacy" && sb.tag === "legacy") {
    return sa.unitKey === sb.unitKey && sa.stashKind === sb.stashKind;
  }
  if (sa.tag === "bare" && sb.tag === "legacy") {
    return sa.unitKey === sb.unitKey && sb.stashKind === APARTMENT_STASH_KIND_FOOTLOCKER;
  }
  if (sa.tag === "legacy" && sb.tag === "bare") {
    return sa.unitKey === sb.unitKey && sa.stashKind === APARTMENT_STASH_KIND_FOOTLOCKER;
  }
  return false;
}

export function apartmentStashKeyMatchesRow(requestedStashKey: string, storedLocationKey: string): boolean {
  return stashLocationMatches(storedLocationKey, requestedStashKey);
}

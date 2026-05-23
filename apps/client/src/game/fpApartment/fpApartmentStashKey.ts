import {
  APARTMENT_STASH_KIND_GROW_TRAY,
  parseBalconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import {
  apartmentStashLocationsMatch,
  type ResolveApartmentDecorStashKind,
} from "@the-mammoth/schemas";

export const APARTMENT_STASH_KIND_FOOTLOCKER = "footlocker";
export const APARTMENT_STASH_KIND_WARDROBE = "wardrobe";
export const APARTMENT_STASH_KIND_STOVE = "stove";
export const APARTMENT_STASH_KIND_FRIDGE = "fridge";
export const APARTMENT_STASH_KIND_WATER_TANK = "water_tank";
export const APARTMENT_STASH_KIND_FISH_TANK = "fish_tank";
export { APARTMENT_STASH_KIND_GROW_TRAY };

export type ApartmentStashKind =
  | typeof APARTMENT_STASH_KIND_FOOTLOCKER
  | typeof APARTMENT_STASH_KIND_WARDROBE
  | typeof APARTMENT_STASH_KIND_STOVE
  | typeof APARTMENT_STASH_KIND_FRIDGE
  | typeof APARTMENT_STASH_KIND_WATER_TANK
  | typeof APARTMENT_STASH_KIND_FISH_TANK
  | typeof APARTMENT_STASH_KIND_GROW_TRAY;

const APARTMENT_STASH_KEY_SEP = "#";

/** Per replica `ApartmentUnitDecor` row — must match `inventory_models::apartment_stash_key_decor`. */
export function apartmentStashKeyDecor(unitKey: string, decorId: bigint): string {
  return `${unitKey}${APARTMENT_STASH_KEY_SEP}d${decorId.toString()}`;
}

export type ParsedApartmentStashKey =
  /** Legacy DB row: exact `unit_key` with no `#` suffix (footlocker-only). */
  | { tag: "bare"; unitKey: string }
  | { tag: "legacy"; unitKey: string; stashKind: ApartmentStashKind }
  | { tag: "decor"; unitKey: string; decorId: bigint }
  | { tag: "grow_tray"; unitKey: string; trayId: string };

/** Full parse — supports `unitKey#wardrobe`, bare `unitKey` (footlocker), `unitKey#d7`, `unitKey#grow_tray:{uuid}`. */
export function parseApartmentStashKeyFull(stashKey: string): ParsedApartmentStashKey {
  const grow = parseBalconyGrowTrayStashKey(stashKey);
  if (grow) {
    return { tag: "grow_tray", unitKey: grow.unitKey, trayId: grow.trayId };
  }
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
      tail === APARTMENT_STASH_KIND_WATER_TANK ||
      tail === APARTMENT_STASH_KIND_FISH_TANK
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
  if (f.tag === "grow_tray") {
    return { unitKey: f.unitKey, stashKind: APARTMENT_STASH_KIND_GROW_TRAY };
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
    case APARTMENT_STASH_KIND_FISH_TANK:
      return "fish tank";
    case APARTMENT_STASH_KIND_GROW_TRAY:
      return "grow tray";
    default:
      return "footlocker";
  }
}

export function apartmentStashKeyMatchesRow(
  requestedStashKey: string,
  storedLocationKey: string,
  resolveDecorStashKind: ResolveApartmentDecorStashKind,
): boolean {
  return apartmentStashLocationsMatch(storedLocationKey, requestedStashKey, resolveDecorStashKind);
}

export type { ResolveApartmentDecorStashKind };

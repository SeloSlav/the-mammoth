/**
 * Whether two apartment stash location keys refer to the same storage volume.
 * Keep in sync with `apps/server/src/inventory_models.rs` (`stash_location_matches_with_ctx`).
 */

import {
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_GROW_TRAY,
  type ApartmentStashKind,
} from "./apartmentStashRules.js";
import { parseBalconyGrowTrayStashKey } from "./balconyGrowOp.js";

const APARTMENT_STASH_KEY_SEP = "#";

export type ParsedApartmentStashLocationKey =
  | { tag: "bare"; unitKey: string }
  | { tag: "legacy"; unitKey: string; stashKind: ApartmentStashKind }
  | { tag: "decor"; unitKey: string; decorId: bigint }
  | { tag: "grow_tray"; unitKey: string; trayId: string };

export function parseApartmentStashLocationKey(raw: string): ParsedApartmentStashLocationKey {
  const grow = parseBalconyGrowTrayStashKey(raw);
  if (grow) {
    return { tag: "grow_tray", unitKey: grow.unitKey, trayId: grow.trayId };
  }
  const split = raw.lastIndexOf(APARTMENT_STASH_KEY_SEP);
  if (split > 0) {
    const unitKey = raw.slice(0, split);
    const tail = raw.slice(split + APARTMENT_STASH_KEY_SEP.length);
    const decorMatch = /^d(\d+)$/u.exec(tail);
    if (decorMatch?.[1]) {
      return { tag: "decor", unitKey, decorId: BigInt(decorMatch[1]) };
    }
    const kinds: ApartmentStashKind[] = [
      "footlocker",
      "wardrobe",
      "stove",
      "fridge",
      "water_tank",
    ];
    if ((kinds as string[]).includes(tail)) {
      return { tag: "legacy", unitKey, stashKind: tail as ApartmentStashKind };
    }
  }
  return { tag: "bare", unitKey: raw };
}

export type ResolveApartmentDecorStashKind = (
  unitKey: string,
  decorId: bigint,
) => ApartmentStashKind | null;

function legacyFootlocker(p: ParsedApartmentStashLocationKey): boolean {
  return p.tag === "legacy" && p.stashKind === APARTMENT_STASH_KIND_FOOTLOCKER;
}

function bareFootlocker(p: ParsedApartmentStashLocationKey): boolean {
  return p.tag === "bare";
}

function isFootlockerParsed(
  p: ParsedApartmentStashLocationKey,
  resolveDecor: ResolveApartmentDecorStashKind,
): boolean {
  if (bareFootlocker(p) || legacyFootlocker(p)) return true;
  if (p.tag === "decor") {
    return resolveDecor(p.unitKey, p.decorId) === APARTMENT_STASH_KIND_FOOTLOCKER;
  }
  return false;
}

/** Footlocker bare / legacy / decor keys on one unit alias (migration); distinct decor footlockers stay separate. */
function footlockerLocationAlias(
  stored: ParsedApartmentStashLocationKey,
  requested: ParsedApartmentStashLocationKey,
): boolean {
  if (stored.tag === "decor" && requested.tag === "decor") {
    return stored.unitKey === requested.unitKey && stored.decorId === requested.decorId;
  }
  if (stored.tag === "decor" || requested.tag === "decor") {
    return stored.unitKey === requested.unitKey;
  }
  return true;
}

function resolvedStashKind(
  p: ParsedApartmentStashLocationKey,
  resolveDecor: ResolveApartmentDecorStashKind,
): ApartmentStashKind | null {
  if (p.tag === "bare") return APARTMENT_STASH_KIND_FOOTLOCKER;
  if (p.tag === "legacy") return p.stashKind;
  if (p.tag === "grow_tray") return APARTMENT_STASH_KIND_GROW_TRAY;
  return resolveDecor(p.unitKey, p.decorId);
}

/**
 * `storedKey` is the value persisted on `StashLocationData.unit_key`.
 * `requestedKey` is the active HUD / reducer stash id.
 */
export function apartmentStashLocationsMatch(
  storedKey: string,
  requestedKey: string,
  resolveDecorStashKind: ResolveApartmentDecorStashKind,
): boolean {
  if (storedKey === requestedKey) return true;

  const stored = parseApartmentStashLocationKey(storedKey);
  const requested = parseApartmentStashLocationKey(requestedKey);

  if (stored.tag === "legacy" && requested.tag === "legacy") {
    return stored.unitKey === requested.unitKey && stored.stashKind === requested.stashKind;
  }
  if (stored.tag === "grow_tray" && requested.tag === "grow_tray") {
    return (
      stored.unitKey === requested.unitKey && stored.trayId === requested.trayId
    );
  }
  if (stored.tag === "bare" && requested.tag === "legacy") {
    return stored.unitKey === requested.unitKey && requested.stashKind === APARTMENT_STASH_KIND_FOOTLOCKER;
  }
  if (stored.tag === "legacy" && requested.tag === "bare") {
    return stored.unitKey === requested.unitKey && stored.stashKind === APARTMENT_STASH_KIND_FOOTLOCKER;
  }

  const storedKind = resolvedStashKind(stored, resolveDecorStashKind);
  const requestedKind = resolvedStashKind(requested, resolveDecorStashKind);
  if (storedKind === null || requestedKind === null || storedKind !== requestedKind) {
    return false;
  }
  if (stored.unitKey !== requested.unitKey) return false;

  if (storedKind === APARTMENT_STASH_KIND_FOOTLOCKER) {
    if (!isFootlockerParsed(stored, resolveDecorStashKind)) return false;
    if (!isFootlockerParsed(requested, resolveDecorStashKind)) return false;
    return footlockerLocationAlias(stored, requested);
  }

  return sameKindStorageAlias(stored, requested);
}

/** Legacy kind suffix and per-decor keys for one furniture type on a unit share one volume. */
function sameKindStorageAlias(
  stored: ParsedApartmentStashLocationKey,
  requested: ParsedApartmentStashLocationKey,
): boolean {
  if (stored.tag === "grow_tray" && requested.tag === "grow_tray") {
    return stored.unitKey === requested.unitKey && stored.trayId === requested.trayId;
  }
  if (stored.tag === "decor" && requested.tag === "decor") {
    return stored.unitKey === requested.unitKey && stored.decorId === requested.decorId;
  }
  return stored.unitKey === requested.unitKey;
}

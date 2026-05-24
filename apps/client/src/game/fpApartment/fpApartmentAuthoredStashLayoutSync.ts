/**
 * Push authored fish tank / filter layout from `owned_apartment_builtins.json` to SpacetimeDB.
 */
import {
  APARTMENT_UNIT_DECOR_ITEM_KIND_FISH_TANK,
  APARTMENT_UNIT_DECOR_ITEM_KIND_FISH_TANK_FILTER,
  apartmentUnitDecorItemKindFromString,
  type OwnedApartmentPlacedItem,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import { peekOwnedApartmentBuiltinsDoc } from "./fpOwnedApartmentBuiltinsFromContent.js";
import { viewerOwnsClaimedApartmentUnit } from "./fpApartmentStashDecorSync.js";

const LAYOUT_SYNC_DEBOUNCE_MS = 1200;
let lastLayoutSyncAtMs = 0;
let layoutSyncInFlight = false;

function authoredStashEntriesFromPlacedItems(
  placedItems: readonly OwnedApartmentPlacedItem[],
): {
  authoredId: string;
  modelRelPath: string;
  itemKind: number;
  fx: number;
  fz: number;
  dy: number;
  yawRad: number;
  pitchRad: number;
  rollRad: number;
  uniformScale: number;
  linkedFishTankAuthoredId: string;
}[] {
  const out: ReturnType<typeof authoredStashEntriesFromPlacedItems> = [];
  for (const item of placedItems) {
    if (item.itemKind !== "fish_tank" && item.itemKind !== "fish_tank_filter") continue;
    const itemKind = apartmentUnitDecorItemKindFromString(item.itemKind);
    if (
      itemKind !== APARTMENT_UNIT_DECOR_ITEM_KIND_FISH_TANK &&
      itemKind !== APARTMENT_UNIT_DECOR_ITEM_KIND_FISH_TANK_FILTER
    ) {
      continue;
    }
    out.push({
      authoredId: item.id,
      modelRelPath: item.modelRelPath,
      itemKind,
      fx: item.fx,
      fz: item.fz,
      dy: item.dy,
      yawRad: item.yawRad,
      pitchRad: item.pitchRad,
      rollRad: item.rollRad,
      uniformScale: item.uniformScale,
      linkedFishTankAuthoredId:
        item.itemKind === "fish_tank_filter" ? (item.linkedFishTankDecorId ?? "") : "",
    });
  }
  return out;
}

/** Debounced layout sync — pairs filter decor rows with tank rows via authoring ids. */
export function requestApartmentAuthoredStashLayoutSync(
  conn: DbConnection,
  unitKey: string,
): void {
  if (!viewerOwnsClaimedApartmentUnit(conn)) return;
  const doc = peekOwnedApartmentBuiltinsDoc();
  if (!doc) return;
  const entries = authoredStashEntriesFromPlacedItems(doc.placedItems);
  if (entries.length === 0) return;

  const now = performance.now();
  if (layoutSyncInFlight || now - lastLayoutSyncAtMs < LAYOUT_SYNC_DEBOUNCE_MS) return;
  lastLayoutSyncAtMs = now;
  layoutSyncInFlight = true;

  void conn.reducers
    .syncApartmentAuthoredStashLayout({ unitKey, entries })
    .catch((err: unknown) => {
      console.warn("[fpApartment] sync_apartment_authored_stash_layout failed", err);
    })
    .finally(() => {
      layoutSyncInFlight = false;
    });
}

/** Reset debounce gate — tests only. */
export function resetApartmentAuthoredStashLayoutSyncForTests(): void {
  lastLayoutSyncAtMs = 0;
  layoutSyncInFlight = false;
}

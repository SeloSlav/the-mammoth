/**
 * Client-triggered backfill for authored apartment stash decor rows (`{unit}#d{id}`).
 * Server also runs on connect/claim; this covers live sessions after module publish.
 */
import type { DbConnection } from "../../module_bindings";
import { apartmentUnitOwnerEqual, UNIT_STATE_CLAIMED } from "./fpApartmentGameplay.js";

const SYNC_DEBOUNCE_MS = 800;
let lastSyncAtMs = 0;
let syncInFlight = false;

/** True when the viewer owns at least one claimed apartment unit. */
export function viewerOwnsClaimedApartmentUnit(conn: DbConnection): boolean {
  const id = conn.identity;
  if (!id) return false;
  for (const row of conn.db.apartment_unit) {
    if (row.state !== UNIT_STATE_CLAIMED) continue;
    if (apartmentUnitOwnerEqual(row.owner, id)) return true;
  }
  return false;
}

/** Debounced `sync_owned_apartment_stash_decor` — safe to call every decor rebuild / FP frame. */
export function requestOwnedApartmentStashDecorSync(conn: DbConnection): void {
  if (!viewerOwnsClaimedApartmentUnit(conn)) return;
  const now = performance.now();
  if (syncInFlight || now - lastSyncAtMs < SYNC_DEBOUNCE_MS) return;
  lastSyncAtMs = now;
  syncInFlight = true;
  void conn.reducers
    .syncOwnedApartmentStashDecor({})
    .catch((err: unknown) => {
      console.warn("[fpApartment] sync_owned_apartment_stash_decor failed", err);
    })
    .finally(() => {
      syncInFlight = false;
    });
}

/** Reset debounce gate — tests only. */
export function resetOwnedApartmentStashDecorSyncForTests(): void {
  lastSyncAtMs = 0;
  syncInFlight = false;
}

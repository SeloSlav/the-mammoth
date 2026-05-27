import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import type { PlayerFirearmChamber } from "../../module_bindings/types";
import { firearmAmmoDefIdForWeapon } from "./fpHotbarResolve";

/** Keep aligned with `apps/server/src/firearm.rs` `PISTOL_CHAMBER_CAPACITY`. */
export const PISTOL_CHAMBER_CAPACITY = 6;
/** Keep aligned with `apps/server/src/firearm.rs` `SHOTGUN_CHAMBER_CAPACITY`. */
export const SHOTGUN_CHAMBER_CAPACITY = 2;

/** Keep aligned with `apps/server/src/firearm.rs` `RELOAD_*_MICROS`. */
export const RELOAD_PISTOL_MS = 2000;
export const RELOAD_SHOTGUN_MS = 2800;

const CHAMBER_CAPACITY_BY_WEAPON: Readonly<Record<string, number>> = {
  pistol: PISTOL_CHAMBER_CAPACITY,
  "shotgun-coach": SHOTGUN_CHAMBER_CAPACITY,
};

export function chamberCapacityForWeapon(weaponDefId: string): number {
  return CHAMBER_CAPACITY_BY_WEAPON[weaponDefId] ?? 0;
}

export function reloadDurationMsForWeapon(weaponDefId: string): number {
  if (weaponDefId === "shotgun-coach") return RELOAD_SHOTGUN_MS;
  if (weaponDefId === "pistol") return RELOAD_PISTOL_MS;
  return 0;
}

/** Full-mag reload time scaled by rounds actually loaded this reload. */
export function scaledReloadDurationMsForPartial(
  weaponDefId: string,
  roundsToLoad: number,
  capacity: number,
): number {
  const fullMs = reloadDurationMsForWeapon(weaponDefId);
  if (capacity <= 0 || roundsToLoad <= 0) return 0;
  return (fullMs * roundsToLoad) / capacity;
}

/** Sum carried reserve ammo (inventory + hotbar) for the weapon’s ammo type. */
export function countCarriedAmmoForWeapon(
  conn: DbConnection,
  owner: Identity,
  weaponDefId: string,
): number {
  const ammoDef = firearmAmmoDefIdForWeapon(weaponDefId);
  if (!ammoDef) return 0;
  let total = 0;
  for (const row of conn.db.inventory_item) {
    const loc = row.location;
    if (loc.tag !== "Inventory" && loc.tag !== "Hotbar") continue;
    if (!loc.value.ownerId.isEqual(owner)) continue;
    if (row.defId !== ammoDef || row.quantity < 1) continue;
    total += row.quantity;
  }
  return total;
}

export type LocalFirearmChamberView = {
  chamberCount: number;
  capacity: number;
  reserveCount: number;
  isReloading: boolean;
  reloadRemainingMs: number;
  weaponSynced: boolean;
};

function readChamberRow(
  conn: DbConnection,
  owner: Identity,
): PlayerFirearmChamber | null {
  return (
    (conn.db.player_firearm_chamber.identity.find(owner) as PlayerFirearmChamber | undefined) ??
    null
  );
}

/** Client-side chamber snapshot for HUD + input gating (server remains authoritative). */
export function getLocalFirearmChamberView(
  conn: DbConnection,
  owner: Identity,
  activeWeaponDefId: string,
): LocalFirearmChamberView {
  const capacity = chamberCapacityForWeapon(activeWeaponDefId);
  const reserveCount = countCarriedAmmoForWeapon(conn, owner, activeWeaponDefId);
  if (capacity <= 0) {
    return {
      chamberCount: 0,
      capacity: 0,
      reserveCount: 0,
      isReloading: false,
      reloadRemainingMs: 0,
      weaponSynced: false,
    };
  }

  const row = readChamberRow(conn, owner);
  const nowUs = Date.now() * 1000;
  const weaponSynced = row?.weaponDefId === activeWeaponDefId;
  const reloadCompleteMicros = row?.reloadCompleteMicros ?? 0n;
  const reloadComplete =
    typeof reloadCompleteMicros === "bigint"
      ? Number(reloadCompleteMicros)
      : Number(reloadCompleteMicros ?? 0);
  const isReloading = reloadComplete > 0 && nowUs < reloadComplete;
  const reloadRemainingMs = isReloading ? Math.max(0, (reloadComplete - nowUs) / 1000) : 0;
  const reloadPendingServerFinish =
    weaponSynced && reloadComplete > 0 && nowUs >= reloadComplete;

  let chamberCount = 0;
  if (weaponSynced) {
    chamberCount = row?.chamberCount ?? 0;
    // Physics tick completes reload ~50ms after the local timer; predict the fill for HUD smoothness.
    if (reloadPendingServerFinish && chamberCount < capacity && reserveCount > 0) {
      const needed = capacity - chamberCount;
      chamberCount = Math.min(capacity, chamberCount + Math.min(needed, reserveCount));
    }
  } else {
    // Hotbar swap syncs on the server; stay at 0 until the row matches the active weapon.
    chamberCount = 0;
  }

  return {
    chamberCount,
    capacity,
    reserveCount,
    isReloading,
    reloadRemainingMs,
    weaponSynced,
  };
}

export function localPlayerCanFireChamberedRound(
  conn: DbConnection,
  owner: Identity,
  weaponDefId: string,
): boolean {
  const view = getLocalFirearmChamberView(conn, owner, weaponDefId);
  return !view.isReloading && view.chamberCount > 0;
}

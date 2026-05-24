/**
 * One stash-key path for apartment décor: `{unit}#d{decorId}` from replica rows.
 *
 * Layout/content ghosts dedupe against nearby DB rows; picks bind the same keys as proximity prompts.
 * Legacy `{unit}#fridge` keys remain a fallback for kinds not yet on decor-instance-only migration.
 */
import * as THREE from "three";
import type { OwnedApartmentPlacedItemKind } from "@the-mammoth/schemas";
import { effectiveOwnedApartmentPlacedKind } from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import type { ApartmentUnitDecor } from "../../module_bindings/types";
import {
  apartmentBuiltinStashInteractRadiusM,
  apartmentDecorRowClientStashKind,
} from "./fpApartmentGameplay.js";
import { apartmentStashKindForPlacedKind } from "./fpApartmentStashResolve.js";
import {
  apartmentStashKey,
  apartmentStashKeyDecor,
  APARTMENT_STASH_KIND_FISH_TANK,
  APARTMENT_STASH_KIND_FISH_TANK_FILTER,
  type ApartmentStashKind,
} from "./fpApartmentStashKey.js";

/** Match server `CONTENT_DECOR_DEDUPE_XZ_M` — content ghost hides when a DB row covers the slot. */
export const CONTENT_DECOR_DB_DEDUPE_XZ_M = 0.4;

/** Stash kinds that require a replica row — no legacy `{unit}#kind` fallback on client. */
export const DECOR_INSTANCE_ONLY_STASH_KINDS: readonly ApartmentStashKind[] = [
  APARTMENT_STASH_KIND_FISH_TANK,
  APARTMENT_STASH_KIND_FISH_TANK_FILTER,
];

export function isDecorInstanceOnlyStashKind(kind: ApartmentStashKind): boolean {
  return (DECOR_INSTANCE_ONLY_STASH_KINDS as readonly string[]).includes(kind);
}

/** Resolve `{unit}#d{id}` for the nearest décor row of a stash kind near a layout/content anchor. */
export function resolveDecorStashKeyNear(
  conn: DbConnection,
  unitKey: string,
  stashKind: ApartmentStashKind,
  nearX: number,
  nearZ: number,
  maxDistM = apartmentBuiltinStashInteractRadiusM(stashKind),
): string | null {
  const maxDistSq = maxDistM * maxDistM;
  let bestKey: string | null = null;
  let bestD = Infinity;
  for (const row of conn.db.apartment_unit_decor) {
    if (row.unitKey !== unitKey) continue;
    if (apartmentDecorRowClientStashKind(row) !== stashKind) continue;
    const dx = row.posX - nearX;
    const dz = row.posZ - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > maxDistSq || d2 >= bestD) continue;
    bestD = d2;
    bestKey = apartmentStashKeyDecor(unitKey, row.decorId);
  }
  return bestKey;
}

/** @deprecated Use {@link resolveDecorStashKeyNear} with `APARTMENT_STASH_KIND_FISH_TANK`. */
export function resolveFishTankDecorStashKeyNear(
  conn: DbConnection,
  unitKey: string,
  nearX: number,
  nearZ: number,
  maxDistM?: number,
): string | null {
  return resolveDecorStashKeyNear(
    conn,
    unitKey,
    APARTMENT_STASH_KIND_FISH_TANK,
    nearX,
    nearZ,
    maxDistM,
  );
}

export function contentDecorCoveredByDbRow(
  content: {
    modelRelPath: string;
    x: number;
    z: number;
    itemKind?: OwnedApartmentPlacedItemKind;
  },
  dbRows: ApartmentUnitDecor[],
): boolean {
  const placedKind: OwnedApartmentPlacedItemKind = content.itemKind
    ? content.itemKind
    : effectiveOwnedApartmentPlacedKind(0, content.modelRelPath);
  const contentStashKind = apartmentStashKindForPlacedKind(placedKind);
  const dedupeSq = CONTENT_DECOR_DB_DEDUPE_XZ_M * CONTENT_DECOR_DB_DEDUPE_XZ_M;

  for (const row of dbRows) {
    const rowStashKind = apartmentDecorRowClientStashKind(row);
    if (contentStashKind && rowStashKind === contentStashKind) {
      const dx = row.posX - content.x;
      const dz = row.posZ - content.z;
      if (dx * dx + dz * dz <= dedupeSq) return true;
      continue;
    }
    if (row.modelRelPath !== content.modelRelPath) continue;
    const dx = row.posX - content.x;
    const dz = row.posZ - content.z;
    if (dx * dx + dz * dz <= dedupeSq) return true;
  }
  return false;
}

/** Bind pick userData for a stash-capable décor placement (DB row or layout ghost). */
export function bindApartmentDecorStashPickUserData(
  conn: DbConnection,
  pick: THREE.Object3D,
  placement: {
    unitKey: string;
    decorId: bigint | null;
    placedKind: OwnedApartmentPlacedItemKind;
    posX: number;
    posZ: number;
  },
): void {
  const stashKind = apartmentStashKindForPlacedKind(placement.placedKind);
  if (!stashKind) return;

  pick.userData.mammothApartmentStashPickUnitKey = placement.unitKey;
  pick.userData.mammothApartmentStashKind = stashKind;

  if (placement.decorId !== null) {
    pick.userData.mammothApartmentStashKey = apartmentStashKeyDecor(
      placement.unitKey,
      placement.decorId,
    );
    return;
  }

  const decorKey = resolveDecorStashKeyNear(
    conn,
    placement.unitKey,
    stashKind,
    placement.posX,
    placement.posZ,
  );
  if (decorKey) {
    pick.userData.mammothApartmentStashKey = decorKey;
    return;
  }

  if (isDecorInstanceOnlyStashKind(stashKind)) {
    pick.userData.mammothDecorStashResolveFromDb = true;
    pick.userData.mammothDecorStashResolveKind = stashKind;
    pick.userData.mammothDecorStashResolvePosX = placement.posX;
    pick.userData.mammothDecorStashResolvePosZ = placement.posZ;
    return;
  }

  pick.userData.mammothApartmentStashKey = apartmentStashKey(placement.unitKey, stashKind);
}

/** Stash key from pick userData — pending layout ghosts resolve `{unit}#d{id}` from replica rows. */
export function resolveApartmentStashKeyFromPickUserData(
  conn: DbConnection,
  userData: THREE.Object3D["userData"],
  pickWorld?: THREE.Vector3,
): string | null {
  const direct = userData.mammothApartmentStashKey;
  if (typeof direct === "string") return direct;
  if (userData.mammothDecorStashResolveFromDb !== true) return null;

  const unitKey = userData.mammothApartmentStashPickUnitKey;
  const stashKind = userData.mammothDecorStashResolveKind;
  const x = pickWorld?.x ?? userData.mammothDecorStashResolvePosX;
  const z = pickWorld?.z ?? userData.mammothDecorStashResolvePosZ;
  if (typeof unitKey !== "string" || typeof stashKind !== "string") return null;
  if (typeof x !== "number" || typeof z !== "number") return null;
  return resolveDecorStashKeyNear(conn, unitKey, stashKind as ApartmentStashKind, x, z);
}

import {
  apartmentStashAcceptsDefId,
  apartmentStashRejectionHint,
  apartmentStashSlotCount,
  APARTMENT_STASH_KIND_GROW_TRAY,
  BALCONY_GROW_TRAY_STASH_PROXIMITY_HINT,
  effectiveOwnedApartmentPlacedKind,
  isApartmentStashSlotIndexValid,
  type ApartmentStashItemCategory,
  type ApartmentStashKind,
  type ResolveApartmentDecorStashKind,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../module_bindings";
import type { MammothItemDef } from "./mammothItemCatalogTypes";
import { apartmentStashKindForPlacedKind } from "../game/fpApartment/fpApartmentStashResolve";
import { clientMayUseApartmentStash } from "../game/fpApartment/fpApartmentGameplay.js";
import { getFpInteractionFeetSnapshot } from "../game/fpInteraction/fpInteractionFeetState.js";
import { showGameplayErrorBar } from "../ui/gameplayErrorBar";
import type { FpActiveStashPanelState } from "../game/fpInteraction/fpActiveStashPanel";

export function mammothItemAllowedInApartmentStash(
  stashKind: ApartmentStashKind,
  def: MammothItemDef,
): boolean {
  return apartmentStashAcceptsDefId(
    stashKind,
    def.id,
    def.category as ApartmentStashItemCategory,
  );
}

export function resolveApartmentDecorStashKindFromConn(
  conn: DbConnection,
  unitKey: string,
  decorId: bigint,
): ApartmentStashKind | null {
  for (const row of conn.db.apartment_unit_decor) {
    if (row.unitKey !== unitKey || row.decorId !== decorId) continue;
    return apartmentStashKindForPlacedKind(
      effectiveOwnedApartmentPlacedKind(row.itemKind, row.modelRelPath),
    );
  }
  return null;
}

export function apartmentDecorStashKindResolver(conn: DbConnection): ResolveApartmentDecorStashKind {
  return (unitKey, decorId) => resolveApartmentDecorStashKindFromConn(conn, unitKey, decorId);
}

export function reportApartmentStashRejection(stashKind: ApartmentStashKind): void {
  showGameplayErrorBar(apartmentStashRejectionHint(stashKind));
}

/** Block optimistic stash moves when the player is too far for server-side grow-tray storage. */
export function clientMayPushToActiveApartmentStash(
  conn: DbConnection,
  activeStash: FpActiveStashPanelState,
): boolean {
  if (!conn.identity) return false;
  const feet = getFpInteractionFeetSnapshot();
  if (!clientMayUseApartmentStash(conn, conn.identity, activeStash.stashKey, feet)) {
    if (activeStash.stashKind === APARTMENT_STASH_KIND_GROW_TRAY) {
      showGameplayErrorBar(BALCONY_GROW_TRAY_STASH_PROXIMITY_HINT);
    } else {
      showGameplayErrorBar("Move closer to this storage.");
    }
    return false;
  }
  return true;
}

export function apartmentStashMoveFailureHint(stashKind: ApartmentStashKind | null | undefined): string {
  if (stashKind === APARTMENT_STASH_KIND_GROW_TRAY) {
    return BALCONY_GROW_TRAY_STASH_PROXIMITY_HINT;
  }
  return "Could not move item into storage. Try again or move closer.";
}

export {
  apartmentStashRejectionHint,
  apartmentStashSlotCount,
  isApartmentStashSlotIndexValid,
};
export type { ApartmentStashKind };

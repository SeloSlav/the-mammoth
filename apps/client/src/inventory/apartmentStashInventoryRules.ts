import {
  apartmentStashAcceptsDefId,
  apartmentStashRejectionHint,
  apartmentStashSlotCount,
  effectiveOwnedApartmentPlacedKind,
  isApartmentStashSlotIndexValid,
  type ApartmentStashItemCategory,
  type ApartmentStashKind,
  type ResolveApartmentDecorStashKind,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../module_bindings";
import type { MammothItemDef } from "./mammothItemCatalogTypes";
import { apartmentStashKindForPlacedKind } from "../game/fpApartment/fpApartmentStashResolve";
import { showMammothInventoryErrorBar } from "./mammothInventoryErrorBar";

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
  showMammothInventoryErrorBar(apartmentStashRejectionHint(stashKind));
}

export {
  apartmentStashRejectionHint,
  apartmentStashSlotCount,
  isApartmentStashSlotIndexValid,
};
export type { ApartmentStashKind };

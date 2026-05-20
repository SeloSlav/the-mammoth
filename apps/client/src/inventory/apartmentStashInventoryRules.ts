import {
  apartmentStashAcceptsDefId,
  apartmentStashRejectionHint,
  apartmentStashSlotCount,
  isApartmentStashSlotIndexValid,
  type ApartmentStashItemCategory,
} from "@the-mammoth/schemas";
import type { MammothItemDef } from "./mammothItemCatalogTypes";
import type { ApartmentStashKind } from "../game/fpApartment/fpApartmentStashKey";

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

export {
  apartmentStashRejectionHint,
  apartmentStashSlotCount,
  isApartmentStashSlotIndexValid,
};

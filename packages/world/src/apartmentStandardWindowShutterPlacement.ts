import {
  eastReferenceFxForStandardWindowShutterId,
  isOwnedApartmentWindowShutterModelRelPath,
  type OwnedApartmentPlacedItem,
} from "@the-mammoth/schemas";
import { mirrorEastBalconyWindowShutterFxForWestUnit } from "./residentialUnitBalcony.js";

export function resolveStandardWindowShutterFxForUnit(
  shutterId: string,
  itemFx: number,
  unitId: string,
  boundMinX: number,
  boundMaxX: number,
): number {
  if (unitId.startsWith("unit_e_")) return itemFx;
  if (!unitId.startsWith("unit_w_")) return itemFx;
  const eastFx = eastReferenceFxForStandardWindowShutterId(shutterId) ?? itemFx;
  return mirrorEastBalconyWindowShutterFxForWestUnit(
    eastFx,
    boundMinX,
    boundMaxX,
    unitId,
  );
}

export function finalizeStandardWindowShutterPlacedItemsForUnit(
  unitId: string,
  placedItems: readonly OwnedApartmentPlacedItem[],
  boundMinX: number,
  boundMaxX: number,
): OwnedApartmentPlacedItem[] {
  if (!unitId.startsWith("unit_w_")) return [...placedItems];
  return placedItems.map((item) => {
    if (!isOwnedApartmentWindowShutterModelRelPath(item.modelRelPath)) return item;
    return {
      ...item,
      fx: resolveStandardWindowShutterFxForUnit(
        item.id,
        item.fx,
        unitId,
        boundMinX,
        boundMaxX,
      ),
    };
  });
}

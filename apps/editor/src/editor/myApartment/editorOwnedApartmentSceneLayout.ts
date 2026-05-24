import {
  OWNED_APARTMENT_MODEL_WINDOW_SHUTTER,
  type OwnedApartmentBuiltinsDoc,
  type OwnedApartmentPlacedItem,
} from "@the-mammoth/schemas";
import { apartmentFishTankDecorTemplateDeps } from "@the-mammoth/world";

/** Unique model paths for all {@link OwnedApartmentBuiltinsDoc.placedItems} (templates to load). */
export function listMyApartmentPlacedItemModelRelPaths(doc: OwnedApartmentBuiltinsDoc): string[] {
  return [...new Set(doc.placedItems.map((p) => p.modelRelPath))];
}

/** Placed-item paths plus implicit assets needed for authoring (fish mesh for inhabited tanks). */
export function listMyApartmentDecorTemplateRelPathsWithDeps(doc: OwnedApartmentBuiltinsDoc): string[] {
  return [
    ...new Set([
      ...listMyApartmentPlacedItemModelRelPaths(doc),
      ...apartmentFishTankDecorTemplateDeps(doc.placedItems.map((p) => p.modelRelPath)),
      OWNED_APARTMENT_MODEL_WINDOW_SHUTTER,
    ]),
  ];
}

export function findOwnedApartmentPlacedBuiltin(
  doc: OwnedApartmentBuiltinsDoc,
  kind: "bed" | "wardrobe" | "footlocker" | "stove",
): OwnedApartmentPlacedItem | undefined {
  return doc.placedItems.find((p) => p.itemKind === kind);
}

export function requireOwnedApartmentPlacedBuiltin(
  doc: OwnedApartmentBuiltinsDoc,
  kind: "bed" | "wardrobe" | "footlocker" | "stove",
): OwnedApartmentPlacedItem {
  const it = findOwnedApartmentPlacedBuiltin(doc, kind);
  if (!it) throw new Error(`Missing owned-apartment builtin placed item (${kind}).`);
  return it;
}

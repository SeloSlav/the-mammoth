import type { OwnedApartmentBuiltinsDoc, OwnedApartmentPlacedItem } from "@the-mammoth/schemas";

/** Unique model paths for all {@link OwnedApartmentBuiltinsDoc.placedItems} (templates to load). */
export function listMyApartmentPlacedItemModelRelPaths(doc: OwnedApartmentBuiltinsDoc): string[] {
  return [...new Set(doc.placedItems.map((p) => p.modelRelPath))];
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

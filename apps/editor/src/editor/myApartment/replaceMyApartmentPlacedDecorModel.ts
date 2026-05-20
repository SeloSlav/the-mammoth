import {
  ownedApartmentPlacedItemKindFromModelRelPath,
  type OwnedApartmentBuiltinsDoc,
  type OwnedApartmentPlacedItem,
} from "@the-mammoth/schemas";

export type ReplaceMyApartmentPlacedDecorModelResult = {
  doc: OwnedApartmentBuiltinsDoc;
  replaced: OwnedApartmentPlacedItem;
};

/**
 * Swap a placed décor instance: new GLB plus inferred `itemKind` (stash / claim / sit rules).
 * Pose, scale, and flags are preserved.
 */
export function replaceMyApartmentPlacedDecorModelInDoc(
  doc: OwnedApartmentBuiltinsDoc,
  decorId: string,
  nextModelRelPath: string,
): ReplaceMyApartmentPlacedDecorModelResult | null {
  const index = doc.placedItems.findIndex((item) => item.id === decorId);
  if (index < 0) return null;

  const prev = doc.placedItems[index]!;
  if (prev.modelRelPath === nextModelRelPath) {
    return { doc, replaced: prev };
  }

  const replaced: OwnedApartmentPlacedItem = {
    ...prev,
    modelRelPath: nextModelRelPath,
    itemKind: ownedApartmentPlacedItemKindFromModelRelPath(nextModelRelPath),
  };

  const placedItems = doc.placedItems.slice();
  placedItems[index] = replaced;

  return {
    doc: { ...doc, placedItems },
    replaced,
  };
}

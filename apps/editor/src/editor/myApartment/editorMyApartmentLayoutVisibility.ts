import {
  isMyApartmentLayoutGroupablePlacementSelectedId,
  parseMyApartmentLayoutWallOpeningSelectedId,
  parseMyApartmentLayoutWallSelectedId,
} from "./editorMyApartmentSelection.js";

/** Decor / slab walls / mirrors / wall-opening proxies — not saved groups or built-ins. */
export function isMyApartmentLayoutHidePickTarget(placementId: string): boolean {
  if (isMyApartmentLayoutGroupablePlacementSelectedId(placementId)) return true;
  return parseMyApartmentLayoutWallOpeningSelectedId(placementId) !== null;
}

export function selectionAfterHidingMyApartmentLayoutPlacement(
  selectedId: string | null,
  extras: readonly string[],
  hiddenPlacementId: string,
): {
  selectedId: string | null;
  myApartmentMultiselectExtraIds: readonly string[];
} {
  if (selectedId === hiddenPlacementId) {
    return { selectedId: null, myApartmentMultiselectExtraIds: [] };
  }
  if (extras.includes(hiddenPlacementId)) {
    return {
      selectedId,
      myApartmentMultiselectExtraIds: extras.filter((id) => id !== hiddenPlacementId),
    };
  }
  return { selectedId, myApartmentMultiselectExtraIds: extras };
}

export function shouldHideMyApartmentLayoutSelectionGroup(
  selectionId: string,
  hiddenPlacementIds: ReadonlySet<string>,
): boolean {
  if (hiddenPlacementIds.has(selectionId)) return true;
  const opening = parseMyApartmentLayoutWallOpeningSelectedId(selectionId);
  if (opening && hiddenPlacementIds.has(`mammoth_editor_my_apartment_wall:${opening.wallId}`)) {
    return true;
  }
  return false;
}

/** Drop stale ids when placements were deleted from the doc. */
export function pruneMyApartmentLayoutHiddenPlacementIds(
  hiddenPlacementIds: readonly string[],
  knownSelectionIds: ReadonlySet<string>,
): readonly string[] {
  const pruned = hiddenPlacementIds.filter((id) => {
    if (knownSelectionIds.has(id)) return true;
    const wallId = parseMyApartmentLayoutWallSelectedId(id);
    if (wallId) {
      return knownSelectionIds.has(`mammoth_editor_my_apartment_wall:${wallId}`);
    }
    const opening = parseMyApartmentLayoutWallOpeningSelectedId(id);
    if (opening) {
      return knownSelectionIds.has(
        `mammoth_editor_my_apartment_wall_opening:${opening.wallId}/${opening.openingId}`,
      );
    }
    return false;
  });
  return pruned.length === hiddenPlacementIds.length ? hiddenPlacementIds : pruned;
}

import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import {
  cloneMyApartmentObjectGroupInDoc,
  clampOwnedApartmentLayoutFraction,
  MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FX,
  MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FZ,
} from "./cloneMyApartmentObjectGroup.js";
import {
  collectMyApartmentLayoutDeletionSelectionIds,
  isMyApartmentLayoutDeletionSelection,
  layoutPlacementEntityIdsFromSelectionIds,
} from "./deleteMyApartmentLayoutPlacements.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForSavedObjectGroup,
  editorMyApartmentSelectedIdForWall,
  parseMyApartmentLayoutDecorSelectedId,
  parseMyApartmentLayoutMirrorSelectedId,
  parseMyApartmentLayoutSavedObjectGroupId,
  parseMyApartmentLayoutWallSelectedId,
} from "./editorMyApartmentSelection.js";

export { isMyApartmentLayoutDeletionSelection as isMyApartmentLayoutCloneSelection };

export type CloneMyApartmentLayoutPlacementsResult = {
  doc: OwnedApartmentBuiltinsDoc;
  selectedId: string;
  myApartmentMultiselectExtraIds: readonly string[];
};

function defaultCreateEntityId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `clone_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Clones every décor / wall / mirror placement id in `selectedIds`, nudging copies in fraction
 * space. Does not handle saved object groups — use {@link cloneMyApartmentObjectGroupInDoc}.
 */
export function cloneMyApartmentLayoutPlacementsInDoc(
  doc: OwnedApartmentBuiltinsDoc,
  selectedIds: readonly string[],
  opts?: {
    createEntityId?: () => string;
    offsetFx?: number;
    offsetFz?: number;
  },
): CloneMyApartmentLayoutPlacementsResult | null {
  const createEntityId = opts?.createEntityId ?? defaultCreateEntityId;
  const offsetFx = opts?.offsetFx ?? MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FX;
  const offsetFz = opts?.offsetFz ?? MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FZ;

  const placedItems = [...doc.placedItems];
  const wallItems = [...doc.wallItems];
  const mirrorItems = [...doc.mirrorItems];
  const clonedSelectedIds: string[] = [];

  for (const selId of selectedIds) {
    const decorId = parseMyApartmentLayoutDecorSelectedId(selId);
    if (decorId) {
      const item = doc.placedItems.find((d) => d.id === decorId);
      if (!item) continue;
      const id = createEntityId();
      placedItems.push({
        ...item,
        id,
        fx: clampOwnedApartmentLayoutFraction(item.fx + offsetFx),
        fz: clampOwnedApartmentLayoutFraction(item.fz + offsetFz),
      });
      clonedSelectedIds.push(editorMyApartmentSelectedIdForDecor(id));
      continue;
    }

    const wallId = parseMyApartmentLayoutWallSelectedId(selId);
    if (wallId) {
      const item = doc.wallItems.find((w) => w.id === wallId);
      if (!item) continue;
      const id = createEntityId();
      wallItems.push({
        ...item,
        id,
        fx: clampOwnedApartmentLayoutFraction(item.fx + offsetFx),
        fz: clampOwnedApartmentLayoutFraction(item.fz + offsetFz),
        material: { ...item.material },
        openings: (item.openings ?? []).map((opening) => ({
          ...opening,
          id: createEntityId(),
        })),
      });
      clonedSelectedIds.push(editorMyApartmentSelectedIdForWall(id));
      continue;
    }

    const mirrorId = parseMyApartmentLayoutMirrorSelectedId(selId);
    if (mirrorId) {
      const item = doc.mirrorItems.find((m) => m.id === mirrorId);
      if (!item) continue;
      const id = createEntityId();
      mirrorItems.push({
        ...item,
        id,
        fx: clampOwnedApartmentLayoutFraction(item.fx + offsetFx),
        fz: clampOwnedApartmentLayoutFraction(item.fz + offsetFz),
      });
      clonedSelectedIds.push(editorMyApartmentSelectedIdForMirror(id));
    }
  }

  if (clonedSelectedIds.length === 0) return null;

  const unique = [...new Set(clonedSelectedIds)];
  if (unique.length === 1) {
    return {
      doc: { ...doc, placedItems, wallItems, mirrorItems },
      selectedId: unique[0]!,
      myApartmentMultiselectExtraIds: [],
    };
  }

  const anchor = unique[0]!;
  const extras = unique.slice(1);
  return {
    doc: { ...doc, placedItems, wallItems, mirrorItems },
    selectedId: anchor,
    myApartmentMultiselectExtraIds: extras,
  };
}

export function cloneMyApartmentLayoutSelectionInDoc(
  doc: OwnedApartmentBuiltinsDoc,
  opts: {
    selectedId: string | null;
    myApartmentMultiselectExtraIds: readonly string[];
    createEntityId?: () => string;
  },
): CloneMyApartmentLayoutPlacementsResult | null {
  if (
    !isMyApartmentLayoutDeletionSelection({
      selectedId: opts.selectedId,
      myApartmentMultiselectExtraIds: opts.myApartmentMultiselectExtraIds,
    })
  ) {
    return null;
  }

  const groupId = parseMyApartmentLayoutSavedObjectGroupId(opts.selectedId);
  if (groupId) {
    const cloned = cloneMyApartmentObjectGroupInDoc(doc, groupId, {
      createEntityId: opts.createEntityId,
    });
    if (!cloned) return null;
    return {
      doc: cloned.doc,
      selectedId: editorMyApartmentSelectedIdForSavedObjectGroup(cloned.newGroupId),
      myApartmentMultiselectExtraIds: [],
    };
  }

  const selectedIds = collectMyApartmentLayoutDeletionSelectionIds({
    selectedId: opts.selectedId,
    myApartmentMultiselectExtraIds: opts.myApartmentMultiselectExtraIds,
  });

  const { decorIds, wallIds, mirrorIds } =
    layoutPlacementEntityIdsFromSelectionIds(selectedIds);
  if (decorIds.size + wallIds.size + mirrorIds.size === 0) return null;

  const placementClone = cloneMyApartmentLayoutPlacementsInDoc(doc, selectedIds, {
    createEntityId: opts.createEntityId,
  });
  if (!placementClone) return null;

  if (selectedIds.length <= 1) return placementClone;

  const sourceAnchor = opts.selectedId;
  const anchorIndex = selectedIds.indexOf(sourceAnchor ?? "");
  const clonedIds = [
    placementClone.selectedId,
    ...placementClone.myApartmentMultiselectExtraIds,
  ];
  if (anchorIndex >= 0 && anchorIndex < clonedIds.length) {
    const anchor = clonedIds[anchorIndex]!;
    const extras = clonedIds.filter((_, i) => i !== anchorIndex);
    return {
      doc: placementClone.doc,
      selectedId: anchor,
      myApartmentMultiselectExtraIds: extras,
    };
  }

  return placementClone;
}

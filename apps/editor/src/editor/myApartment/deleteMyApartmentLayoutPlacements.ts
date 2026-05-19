import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import {
  parseMyApartmentLayoutDecorSelectedId,
  parseMyApartmentLayoutMirrorSelectedId,
  parseMyApartmentLayoutSavedObjectGroupId,
  parseMyApartmentLayoutWallSelectedId,
} from "./editorMyApartmentSelection.js";

export type LayoutPlacementEntityIds = {
  decorIds: ReadonlySet<string>;
  wallIds: ReadonlySet<string>;
  mirrorIds: ReadonlySet<string>;
};

export function layoutPlacementEntityIdsFromSelectionIds(
  selectedIds: readonly string[],
): LayoutPlacementEntityIds {
  const decorIds = new Set<string>();
  const wallIds = new Set<string>();
  const mirrorIds = new Set<string>();

  for (const selId of selectedIds) {
    const decorId = parseMyApartmentLayoutDecorSelectedId(selId);
    if (decorId) {
      decorIds.add(decorId);
      continue;
    }
    const wallId = parseMyApartmentLayoutWallSelectedId(selId);
    if (wallId) {
      wallIds.add(wallId);
      continue;
    }
    const mirrorId = parseMyApartmentLayoutMirrorSelectedId(selId);
    if (mirrorId) {
      mirrorIds.add(mirrorId);
    }
  }

  return { decorIds, wallIds, mirrorIds };
}

export function deleteMyApartmentLayoutPlacementsInDoc(
  doc: OwnedApartmentBuiltinsDoc,
  selectedIds: readonly string[],
): OwnedApartmentBuiltinsDoc | null {
  const { decorIds, wallIds, mirrorIds } =
    layoutPlacementEntityIdsFromSelectionIds(selectedIds);
  if (decorIds.size + wallIds.size + mirrorIds.size === 0) return null;

  return {
    ...doc,
    placedItems: doc.placedItems.filter((item) => !decorIds.has(item.id)),
    wallItems: doc.wallItems.filter((item) => !wallIds.has(item.id)),
    mirrorItems: doc.mirrorItems.filter((item) => !mirrorIds.has(item.id)),
  };
}

export function deleteMyApartmentObjectGroupMembersInDoc(
  doc: OwnedApartmentBuiltinsDoc,
  groupId: string,
): OwnedApartmentBuiltinsDoc | null {
  const group = doc.objectGroups.find((g) => g.id === groupId);
  if (!group) return null;

  const withoutMembers = deleteMyApartmentLayoutPlacementsInDoc(
    doc,
    group.memberSelectedIds,
  );
  if (!withoutMembers) return null;

  return {
    ...withoutMembers,
    objectGroups: withoutMembers.objectGroups.filter((g) => g.id !== groupId),
  };
}

export function collectMyApartmentLayoutDeletionSelectionIds(opts: {
  selectedId: string | null;
  myApartmentMultiselectExtraIds: readonly string[];
}): readonly string[] {
  const groupId = parseMyApartmentLayoutSavedObjectGroupId(opts.selectedId);
  if (groupId) return [`group:${groupId}`];

  const out: string[] = [];
  if (typeof opts.selectedId === "string") out.push(opts.selectedId);
  for (const extra of opts.myApartmentMultiselectExtraIds) out.push(extra);
  return out;
}

export function isMyApartmentLayoutDeletionSelection(opts: {
  selectedId: string | null;
  myApartmentMultiselectExtraIds: readonly string[];
}): boolean {
  const ids = collectMyApartmentLayoutDeletionSelectionIds(opts);
  if (ids.length === 1 && ids[0]!.startsWith("group:")) return true;

  const { decorIds, wallIds, mirrorIds } = layoutPlacementEntityIdsFromSelectionIds(ids);
  return decorIds.size + wallIds.size + mirrorIds.size > 0;
}

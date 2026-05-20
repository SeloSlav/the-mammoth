import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import {
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
} from "@the-mammoth/schemas";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForWall,
  parseMyApartmentLayoutDecorSelectedId,
  parseMyApartmentLayoutMirrorSelectedId,
  parseMyApartmentLayoutWallSelectedId,
} from "./editorMyApartmentSelection.js";

/** Nudge cloned groups in fraction space so duplicates are visible beside the source. */
export const MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FX = 0.06;
export const MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FZ = 0.06;

export function clampOwnedApartmentLayoutFraction(n: number): number {
  return Math.min(
    OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
    Math.max(OWNED_APARTMENT_LAYOUT_FRACTION_MIN, n),
  );
}

export type CloneMyApartmentObjectGroupResult = {
  doc: OwnedApartmentBuiltinsDoc;
  newGroupId: string;
};

export function cloneMyApartmentObjectGroupInDoc(
  doc: OwnedApartmentBuiltinsDoc,
  groupId: string,
  opts?: {
    newGroupId?: string;
    createEntityId?: () => string;
    offsetFx?: number;
    offsetFz?: number;
  },
): CloneMyApartmentObjectGroupResult | null {
  const source = doc.objectGroups.find((g) => g.id === groupId);
  if (!source) return null;

  const createEntityId =
    opts?.createEntityId ??
    (() =>
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `clone_${Date.now()}_${Math.random().toString(16).slice(2)}`);

  const newGroupId = opts?.newGroupId ?? createEntityId();
  const offsetFx = opts?.offsetFx ?? MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FX;
  const offsetFz = opts?.offsetFz ?? MY_APARTMENT_OBJECT_GROUP_CLONE_OFFSET_FZ;

  const placedItems = [...doc.placedItems];
  const wallItems = [...doc.wallItems];
  const mirrorItems = [...doc.mirrorItems];
  const newMemberSelectedIds: string[] = [];

  for (const selId of source.memberSelectedIds) {
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
      newMemberSelectedIds.push(editorMyApartmentSelectedIdForDecor(id));
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
      newMemberSelectedIds.push(editorMyApartmentSelectedIdForWall(id));
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
      newMemberSelectedIds.push(editorMyApartmentSelectedIdForMirror(id));
    }
  }

  const uniqueMembers = [...new Set(newMemberSelectedIds)].sort((a, b) =>
    a.localeCompare(b),
  );
  if (uniqueMembers.length < 2) return null;

  const cloneName = `${source.name} copy`.slice(0, 200);

  return {
    doc: {
      ...doc,
      placedItems,
      wallItems,
      mirrorItems,
      objectGroups: [
        ...doc.objectGroups,
        {
          id: newGroupId,
          name: cloneName,
          memberSelectedIds: uniqueMembers,
        },
      ],
    },
    newGroupId,
  };
}

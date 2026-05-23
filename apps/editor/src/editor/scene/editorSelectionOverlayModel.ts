import type * as THREE from "three";
import type { OwnedApartmentObjectGroup } from "@the-mammoth/schemas";
import { getEditorMyApartmentStaticSelectionGroupsMap } from "../myApartment/editorMyApartmentPieceGroupBridge.js";
import {
  isMyApartmentLayoutGroupablePlacementSelectedId,
  parseMyApartmentLayoutSavedObjectGroupId,
} from "../myApartment/editorMyApartmentSelection.js";
import {
  resolveEditorSelectionDisplayName,
  resolveEditorSelectionDisplayNameFromId,
  type EditorSelectionDisplayNameContext,
} from "./editorSelectionDisplayName.js";
import {
  measureEditorSelectionMeshStats,
  type EditorSelectionMeshStats,
} from "./editorSelectionMeshStats.js";

export type EditorSelectionOverlayEntry = {
  selectionId: string;
  name: string;
  stats: EditorSelectionMeshStats;
};

export type EditorSelectionOverlayModel = {
  kind: "single" | "multi" | "group";
  eyebrow: string;
  title: string;
  entries: EditorSelectionOverlayEntry[];
  totals: EditorSelectionMeshStats;
};

function emptyStats(): EditorSelectionMeshStats {
  return { triangles: 0, vertices: 0, meshCount: 0 };
}

function sumSelectionStats(
  entries: readonly EditorSelectionOverlayEntry[],
): EditorSelectionMeshStats {
  return entries.reduce(
    (acc, entry) => ({
      triangles: acc.triangles + entry.stats.triangles,
      vertices: acc.vertices + entry.stats.vertices,
      meshCount: acc.meshCount + entry.stats.meshCount,
    }),
    emptyStats(),
  );
}

function readEntryForSelectionId(args: {
  selectionId: string;
  nameContext?: EditorSelectionDisplayNameContext;
}): EditorSelectionOverlayEntry | null {
  const map = getEditorMyApartmentStaticSelectionGroupsMap();
  const target = map?.[args.selectionId] ?? null;
  const stats = target ? measureEditorSelectionMeshStats(target) : emptyStats();
  const name = target
    ? resolveEditorSelectionDisplayName(target, args.selectionId)
    : resolveEditorSelectionDisplayNameFromId(args.selectionId, args.nameContext);
  return { selectionId: args.selectionId, name, stats };
}

function readEntriesForSelectionIds(args: {
  selectionIds: readonly string[];
  nameContext?: EditorSelectionDisplayNameContext;
}): EditorSelectionOverlayEntry[] {
  const out: EditorSelectionOverlayEntry[] = [];
  for (const selectionId of args.selectionIds) {
    const entry = readEntryForSelectionId({
      selectionId,
      nameContext: args.nameContext,
    });
    if (entry) out.push(entry);
  }
  return out;
}

function collectApartmentMultiselectIds(args: {
  selectedId: string;
  extras: readonly string[];
}): string[] {
  const multiset = new Set<string>();
  for (const extra of args.extras) {
    if (isMyApartmentLayoutGroupablePlacementSelectedId(extra)) multiset.add(extra);
  }
  if (isMyApartmentLayoutGroupablePlacementSelectedId(args.selectedId)) {
    multiset.add(args.selectedId);
  }
  return [...multiset].sort((a, b) => a.localeCompare(b));
}

function buildGroupOverlayModel(args: {
  group: OwnedApartmentObjectGroup;
  nameContext?: EditorSelectionDisplayNameContext;
}): EditorSelectionOverlayModel {
  const entries = readEntriesForSelectionIds({
    selectionIds: args.group.memberSelectedIds,
    nameContext: args.nameContext,
  });
  return {
    kind: "group",
    eyebrow: "Saved group",
    title: args.group.name,
    entries,
    totals: sumSelectionStats(entries),
  };
}

function buildMultiOverlayModel(args: {
  selectionIds: readonly string[];
  nameContext?: EditorSelectionDisplayNameContext;
}): EditorSelectionOverlayModel {
  const entries = readEntriesForSelectionIds({
    selectionIds: args.selectionIds,
    nameContext: args.nameContext,
  });
  return {
    kind: "multi",
    eyebrow: "Selected objects",
    title: `${entries.length} selected`,
    entries,
    totals: sumSelectionStats(entries),
  };
}

function buildSingleOverlayModel(args: {
  selectedId: string;
  target: THREE.Object3D;
}): EditorSelectionOverlayModel {
  const stats = measureEditorSelectionMeshStats(args.target);
  const name = resolveEditorSelectionDisplayName(args.target, args.selectedId);
  const entry: EditorSelectionOverlayEntry = {
    selectionId: args.selectedId,
    name,
    stats,
  };
  return {
    kind: "single",
    eyebrow: "Selected object",
    title: name,
    entries: [entry],
    totals: stats,
  };
}

export function buildEditorSelectionOverlayModel(args: {
  mode: string;
  selectedId: string | null;
  myApartmentMultiselectExtraIds: readonly string[];
  objectGroups: readonly OwnedApartmentObjectGroup[];
  placedItems: readonly { id: string; modelRelPath: string }[];
  fallbackTarget: THREE.Object3D | null;
}): EditorSelectionOverlayModel | null {
  if (!args.selectedId) return null;

  const nameContext: EditorSelectionDisplayNameContext = {
    placedItems: args.placedItems,
    objectGroups: args.objectGroups,
  };

  if (args.mode === "my_apartment_layout") {
    const savedGroupId = parseMyApartmentLayoutSavedObjectGroupId(args.selectedId);
    if (savedGroupId) {
      const group = args.objectGroups.find((g) => g.id === savedGroupId);
      if (!group) return null;
      return buildGroupOverlayModel({ group, nameContext });
    }

    const multiselectIds = collectApartmentMultiselectIds({
      selectedId: args.selectedId,
      extras: args.myApartmentMultiselectExtraIds,
    });
    if (multiselectIds.length >= 2) {
      return buildMultiOverlayModel({ selectionIds: multiselectIds, nameContext });
    }

    const map = getEditorMyApartmentStaticSelectionGroupsMap();
    const target = map?.[args.selectedId] ?? args.fallbackTarget;
    if (!target) return null;
    return buildSingleOverlayModel({ selectedId: args.selectedId, target });
  }

  if (!args.fallbackTarget) return null;
  return buildSingleOverlayModel({
    selectedId: args.selectedId,
    target: args.fallbackTarget,
  });
}

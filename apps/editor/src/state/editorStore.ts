import {
  BuildingDocSchema,
  FloorDocSchema,
  InteriorDocSchema,
  type BuildingDoc,
  type FloorDoc,
  type InteriorDoc,
  type PlacedObject,
} from "@the-mammoth/schemas";
import { create } from "zustand";

export type EditorMode = "floor" | "interior";

export type TransformMode = "translate" | "rotate" | "scale";

type HistoryEntry = {
  floorDocs: Record<string, FloorDoc>;
  interiorDocs: Record<string, InteriorDoc>;
  building: BuildingDoc;
  selectedId: string | null;
  dirty: boolean;
  contentStructureEpoch: number;
};

function cloneHistorySlice(state: EditorState): HistoryEntry {
  return {
    floorDocs: structuredClone(state.floorDocs),
    interiorDocs: structuredClone(state.interiorDocs),
    building: structuredClone(state.building),
    selectedId: state.selectedId,
    dirty: state.dirty,
    contentStructureEpoch: state.contentStructureEpoch ?? 0,
  };
}

export type EditorMaterialMeta = {
  mapUrl?: string;
  roughness?: number;
  metalness?: number;
};

export interface EditorState {
  mode: EditorMode;
  building: BuildingDoc;
  floorDocs: Record<string, FloorDoc>;
  interiorDocs: Record<string, InteriorDoc>;
  activeFloorDocId: string;
  activeInteriorDocId: string;
  /** 1-based storey row from mammoth `floorRefs` (drives `storyLevelIndex` in mesh build). */
  focusedStoryLevelIndex: number;
  selectedId: string | null;
  dirty: boolean;
  transformMode: TransformMode;
  /** 0 = disabled */
  gridSnapM: number;
  shadowsEnabled: boolean;
  useHdriEnvironment: boolean;
  /** Incremented only when 3D mesh regen is required (not on pure transform edits). */
  contentStructureEpoch: number;
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];

  beginTransaction: () => void;
  commitTransaction: () => void;
  undo: () => void;
  redo: () => void;

  setMode: (mode: EditorMode) => void;
  setBuilding: (doc: BuildingDoc) => void;
  patchBuilding: (fn: (b: BuildingDoc) => BuildingDoc) => void;
  setFloorDoc: (id: string, doc: FloorDoc) => void;
  setInteriorDoc: (id: string, doc: InteriorDoc) => void;
  setActiveFloorDocId: (id: string) => void;
  setActiveInteriorDocId: (id: string) => void;
  setFocusedStoryLevelIndex: (level: number) => void;
  setSelectedId: (id: string | null) => void;
  setDirty: (dirty: boolean) => void;
  setTransformMode: (m: TransformMode) => void;
  setGridSnapM: (m: number) => void;
  setShadowsEnabled: (on: boolean) => void;
  setUseHdriEnvironment: (on: boolean) => void;

  getActiveFloorDoc: () => FloorDoc | undefined;
  getActiveInteriorDoc: () => InteriorDoc | undefined;

  updatePlacedObject: (
    floorDocId: string,
    objectId: string,
    patch: Partial<Pick<PlacedObject, "position" | "rotation" | "scale" | "prefabId" | "metadata">>,
  ) => void;
  updateInteriorPlacement: (
    interiorDocId: string,
    entityId: string,
    patch: Partial<{
      position: PlacedObject["position"];
      rotation: NonNullable<PlacedObject["rotation"]>;
      scale: NonNullable<PlacedObject["scale"]>;
      prefabId: string;
      overrides: Record<string, unknown> | undefined;
    }>,
  ) => void;

  addFloorObject: (floorDocId: string, obj: PlacedObject) => void;
  deleteFloorObject: (floorDocId: string, objectId: string) => void;
  duplicateFloorObject: (floorDocId: string, objectId: string) => void;

  addInteriorPlacement: (interiorDocId: string, row: InteriorDoc["placements"][number]) => void;
  deleteInteriorPlacement: (interiorDocId: string, entityId: string) => void;
  duplicateInteriorPlacement: (interiorDocId: string, entityId: string) => void;

  replaceFloorDocFromRemote: (id: string, doc: FloorDoc) => void;
  replaceInteriorDocFromRemote: (id: string, doc: InteriorDoc) => void;
  replaceBuildingFromRemote: (doc: BuildingDoc) => void;
}

let transactionDepth = 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  mode: "floor",
  building: BuildingDocSchema.parse({ id: "mammoth_main", version: 1, floorRefs: [] }),
  floorDocs: {},
  interiorDocs: {},
  activeFloorDocId: "floor_mamutica_ground",
  activeInteriorDocId: "lobby_central",
  focusedStoryLevelIndex: 1,
  selectedId: null,
  dirty: false,
  transformMode: "translate",
  gridSnapM: 0,
  shadowsEnabled: false,
  useHdriEnvironment: true,
  historyPast: [],
  historyFuture: [],
  contentStructureEpoch: 0,

  beginTransaction: () => {
    transactionDepth += 1;
    if (transactionDepth === 1) {
      const snap = cloneHistorySlice(get());
      set((s) => ({
        historyPast: [...s.historyPast.slice(-49), snap],
        historyFuture: [],
      }));
    }
  },

  commitTransaction: () => {
    transactionDepth = Math.max(0, transactionDepth - 1);
  },

  undo: () => {
    const past = get().historyPast;
    if (past.length === 0) return;
    const current = cloneHistorySlice(get());
    const prev = past.at(-1);
    if (!prev) return;
    set({
      historyPast: past.slice(0, -1),
      historyFuture: [current, ...get().historyFuture],
      floorDocs: prev.floorDocs,
      interiorDocs: prev.interiorDocs,
      building: prev.building,
      selectedId: prev.selectedId,
      dirty: prev.dirty,
      contentStructureEpoch: prev.contentStructureEpoch ?? 0,
    });
  },

  redo: () => {
    const fut = get().historyFuture;
    if (fut.length === 0) return;
    const current = cloneHistorySlice(get());
    const next = fut.at(0);
    if (!next) return;
    set({
      historyFuture: fut.slice(1),
      historyPast: [...get().historyPast, current],
      floorDocs: next.floorDocs,
      interiorDocs: next.interiorDocs,
      building: next.building,
      selectedId: next.selectedId,
      dirty: next.dirty,
      contentStructureEpoch: next.contentStructureEpoch ?? 0,
    });
  },

  setMode: (mode) =>
    set((s) =>
      s.mode === mode
        ? { mode }
        : { mode, contentStructureEpoch: s.contentStructureEpoch + 1 },
    ),
  setBuilding: (building) =>
    set((s) => ({
      building,
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),
  patchBuilding: (fn) => {
    maybePushHistory(get, set);
    set((s) => ({
      building: fn(s.building),
      dirty: true,
      contentStructureEpoch: s.contentStructureEpoch + 1,
    }));
  },
  setFloorDoc: (id, doc) =>
    set((s) => ({
      floorDocs: { ...s.floorDocs, [id]: doc },
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),
  setInteriorDoc: (id, doc) =>
    set((s) => ({
      interiorDocs: { ...s.interiorDocs, [id]: doc },
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),
  setActiveFloorDocId: (activeFloorDocId) => set({ activeFloorDocId }),
  setActiveInteriorDocId: (activeInteriorDocId) =>
    set((s) =>
      s.activeInteriorDocId === activeInteriorDocId
        ? { activeInteriorDocId }
        : {
            activeInteriorDocId,
            contentStructureEpoch: s.contentStructureEpoch + 1,
          },
    ),
  setFocusedStoryLevelIndex: (focusedStoryLevelIndex) => set({ focusedStoryLevelIndex }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setDirty: (dirty) => set({ dirty }),
  setTransformMode: (transformMode) => set({ transformMode }),
  setGridSnapM: (gridSnapM) => set({ gridSnapM }),
  setShadowsEnabled: (shadowsEnabled) => set({ shadowsEnabled }),
  setUseHdriEnvironment: (useHdriEnvironment) => set({ useHdriEnvironment }),

  getActiveFloorDoc: () => get().floorDocs[get().activeFloorDocId],
  getActiveInteriorDoc: () => get().interiorDocs[get().activeInteriorDocId],

  updatePlacedObject: (floorDocId, objectId, patch) => {
    maybePushHistory(get, set);
    const structural = "prefabId" in patch || "metadata" in patch;
    set((s) => {
      const cur = s.floorDocs[floorDocId];
      if (!cur) return s;
      const objects = cur.objects.map((o) =>
        o.id === objectId ? { ...o, ...patch } : o,
      );
      return {
        floorDocs: { ...s.floorDocs, [floorDocId]: { ...cur, objects } },
        dirty: true,
        ...(structural
          ? { contentStructureEpoch: s.contentStructureEpoch + 1 }
          : {}),
      };
    });
  },

  updateInteriorPlacement: (interiorDocId, entityId, patch) => {
    maybePushHistory(get, set);
    const structural =
      "prefabId" in patch ||
      "assetId" in patch ||
      "overrides" in patch;
    set((s) => {
      const cur = s.interiorDocs[interiorDocId];
      if (!cur) return s;
      const placements = cur.placements.map((p) =>
        p.entityId === entityId ? { ...p, ...patch } : p,
      );
      return {
        interiorDocs: {
          ...s.interiorDocs,
          [interiorDocId]: { ...cur, placements },
        },
        dirty: true,
        ...(structural
          ? { contentStructureEpoch: s.contentStructureEpoch + 1 }
          : {}),
      };
    });
  },

  addFloorObject: (floorDocId, obj) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.floorDocs[floorDocId];
      if (!cur) return s;
      return {
        floorDocs: {
          ...s.floorDocs,
          [floorDocId]: { ...cur, objects: [...cur.objects, obj] },
        },
        dirty: true,
        selectedId: obj.id,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  deleteFloorObject: (floorDocId, objectId) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.floorDocs[floorDocId];
      if (!cur) return s;
      return {
        floorDocs: {
          ...s.floorDocs,
          [floorDocId]: {
            ...cur,
            objects: cur.objects.filter((o) => o.id !== objectId),
          },
        },
        dirty: true,
        selectedId: s.selectedId === objectId ? null : s.selectedId,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  duplicateFloorObject: (floorDocId, objectId) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.floorDocs[floorDocId];
      if (!cur) return s;
      const src = cur.objects.find((o) => o.id === objectId);
      if (!src) return s;
      const copy: PlacedObject = {
        ...src,
        id: crypto.randomUUID(),
        position: [
          src.position[0] + 1,
          src.position[1],
          src.position[2] + 1,
        ] as PlacedObject["position"],
      };
      return {
        floorDocs: {
          ...s.floorDocs,
          [floorDocId]: { ...cur, objects: [...cur.objects, copy] },
        },
        dirty: true,
        selectedId: copy.id,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  addInteriorPlacement: (interiorDocId, row) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.interiorDocs[interiorDocId];
      if (!cur) return s;
      return {
        interiorDocs: {
          ...s.interiorDocs,
          [interiorDocId]: { ...cur, placements: [...cur.placements, row] },
        },
        dirty: true,
        selectedId: row.entityId,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  deleteInteriorPlacement: (interiorDocId, entityId) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.interiorDocs[interiorDocId];
      if (!cur) return s;
      return {
        interiorDocs: {
          ...s.interiorDocs,
          [interiorDocId]: {
            ...cur,
            placements: cur.placements.filter((p) => p.entityId !== entityId),
          },
        },
        dirty: true,
        selectedId: s.selectedId === entityId ? null : s.selectedId,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  duplicateInteriorPlacement: (interiorDocId, entityId) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.interiorDocs[interiorDocId];
      if (!cur) return s;
      const src = cur.placements.find((p) => p.entityId === entityId);
      if (!src) return s;
      const copy = {
        ...src,
        entityId: crypto.randomUUID(),
        position: [
          src.position[0] + 1,
          src.position[1],
          src.position[2] + 1,
        ] as PlacedObject["position"],
      };
      return {
        interiorDocs: {
          ...s.interiorDocs,
          [interiorDocId]: { ...cur, placements: [...cur.placements, copy] },
        },
        dirty: true,
        selectedId: copy.entityId,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  replaceFloorDocFromRemote: (id, doc) =>
    set((s) => ({
      floorDocs: { ...s.floorDocs, [id]: FloorDocSchema.parse(doc) },
      dirty: false,
      historyPast: [],
      historyFuture: [],
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),

  replaceInteriorDocFromRemote: (id, doc) =>
    set((s) => ({
      interiorDocs: { ...s.interiorDocs, [id]: InteriorDocSchema.parse(doc) },
      dirty: false,
      historyPast: [],
      historyFuture: [],
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),

  replaceBuildingFromRemote: (doc) =>
    set((s) => ({
      building: BuildingDocSchema.parse(doc),
      dirty: false,
      historyPast: [],
      historyFuture: [],
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),
}));

function maybePushHistory(
  get: () => EditorState,
  set: (partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void,
) {
  if (transactionDepth > 0) return;
  const snap = cloneHistorySlice(get());
  set((s) => ({
    historyPast: [...s.historyPast.slice(-49), snap],
    historyFuture: [],
  }));
}

export function collectPrefabIdsFromFloors(floorDocs: Record<string, FloorDoc>): string[] {
  const s = new Set<string>();
  for (const d of Object.values(floorDocs)) {
    for (const o of d.objects) s.add(o.prefabId);
  }
  return [...s].sort();
}

export function collectPrefabIdsFromInteriors(
  interiorDocs: Record<string, InteriorDoc>,
): string[] {
  const s = new Set<string>();
  for (const d of Object.values(interiorDocs)) {
    for (const p of d.placements) {
      if (p.prefabId) s.add(p.prefabId);
    }
  }
  return [...s].sort();
}

export function serializeFloorDocPretty(doc: FloorDoc): string {
  return `${JSON.stringify(FloorDocSchema.parse(doc), null, 2)}\n`;
}

export function serializeInteriorDocPretty(doc: InteriorDoc): string {
  return `${JSON.stringify(InteriorDocSchema.parse(doc), null, 2)}\n`;
}

export function serializeBuildingDocPretty(doc: BuildingDoc): string {
  return `${JSON.stringify(BuildingDocSchema.parse(doc), null, 2)}\n`;
}

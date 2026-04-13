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
import type { PrimitiveSwingKeyframe } from "@the-mammoth/engine";
import type { FpAuthorWeaponId } from "../editor/weaponPresentationDiskSave.js";

/**
 * Dev-only: set to any {@link FpAuthorWeaponId} (`ALL_WEAPON_DEFINITIONS` in engine) so the editor
 * opens FP authoring on that weapon. `null` = use `DEFAULT_FP_AUTHOR_WEAPON_ID` (crowbar).
 */
const FP_AUTHOR_DEV_DEFAULT_WEAPON: FpAuthorWeaponId | null = null;

const DEFAULT_FP_AUTHOR_WEAPON_ID: FpAuthorWeaponId = "crowbar";

export type EditorMode = "floor" | "interior" | "fp_viewmodel";

export type FpAuthorCameraKind = "gameplay" | "orbit";

/** Default FP gizmo + orbit framing: weapon root vs grip (`firstPerson.mount` in JSON). */
export const FP_AUTHOR_PREFERRED_TARGET_ID = "weaponRoot";

export type TransformMode = "translate" | "rotate" | "scale";

/** FP gizmo dropdown only — object refs stay in the Three runtime. */
export type FpAuthorPickMeta = { id: string; label: string };

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
  /** First-person viewmodel layout (same GLBs as gameplay; dev tooling). */
  fpAuthorCamera: FpAuthorCameraKind;
  /** Matches {@link LocalFirstPersonPresenter.getAuthoringPickList} ids. */
  fpAuthorTargetId: string;
  /** Look pitch (rad) into {@link LocalFirstPersonPresenter} `fpRoot` when using gameplay camera. */
  fpAuthorPitchRad: number;
  /** Set when FP session fails to load GLBs (e.g. `/static` not served). */
  fpAuthorInitMessage: string | null;
  /** Incremented when FP gizmo moves so React panels can refresh export JSON. */
  fpAuthorLive: number;
  /** Save / frame feedback (shown under FP tools; auto-clears). */
  fpAuthorToast: string | null;
  /** Mirrors LocalFirstPersonPresenter authoring pick ids/labels (updated from the scene tick). */
  fpAuthorPickList: readonly FpAuthorPickMeta[];
  /** Which weapon’s `content/weapons/<id>.presentation.json` the FP tools edit / save. */
  fpAuthorWeaponId: FpAuthorWeaponId;
  /** 0–1 along `firstPerson.meleeSwing` while authoring (head-pitch / fpRoot space). */
  fpSwingPreviewPhase01: number;
  /** In-memory swing track edits; `null` = follow weapon definition / disk until next capture. */
  fpSwingKeyframesDraft: PrimitiveSwingKeyframe[] | null;
  /** When true, the scene tick advances {@link fpSwingPreviewPhase01} for a looping preview. */
  fpSwingPlayActive: boolean;
  /**
   * When true, the next left-button drag on the FP canvas (not on the transform gizmo) becomes a
   * viewport swing stroke and builds {@link fpSwingKeyframesDraft}.
   */
  fpSwingStrokeArmed: boolean;
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
  setFpAuthorCamera: (c: FpAuthorCameraKind) => void;
  setFpAuthorTargetId: (id: string) => void;
  /** Atomically select an FP authoring part and bump live counter (React + scene stay aligned). */
  pickFpAuthorTarget: (id: string) => void;
  setFpAuthorPitchRad: (r: number) => void;
  setFpAuthorInitMessage: (m: string | null) => void;
  bumpFpAuthorLive: () => void;
  setFpAuthorPickList: (list: readonly FpAuthorPickMeta[]) => void;
  setFpAuthorWeaponId: (id: FpAuthorWeaponId) => void;
  setFpSwingPreviewPhase01: (t: number) => void;
  setFpSwingKeyframesDraft: (keys: PrimitiveSwingKeyframe[] | null) => void;
  setFpSwingPlayActive: (on: boolean) => void;
  setFpSwingStrokeArmed: (on: boolean) => void;
  /** FP disk save / frame result; clears after `ttlMs` unless replaced. */
  showFpAuthorToast: (message: string, ttlMs?: number) => void;

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
  mode: "fp_viewmodel",
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
  fpAuthorCamera: "orbit",
  fpAuthorTargetId: FP_AUTHOR_PREFERRED_TARGET_ID,
  /** 0 = same as client before mouse look (`mountFpSession` initial pitch). */
  fpAuthorPitchRad: 0,
  fpAuthorInitMessage: null,
  fpAuthorLive: 0,
  fpAuthorToast: null,
  fpAuthorPickList: [],
  fpAuthorWeaponId: FP_AUTHOR_DEV_DEFAULT_WEAPON ?? DEFAULT_FP_AUTHOR_WEAPON_ID,
  fpSwingPreviewPhase01: 0,
  fpSwingKeyframesDraft: null,
  fpSwingPlayActive: false,
  fpSwingStrokeArmed: false,
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
    set((s) => {
      if (s.mode === mode) return { mode };
      const touchesFp = s.mode === "fp_viewmodel" || mode === "fp_viewmodel";
      const exitFp = s.mode === "fp_viewmodel" && mode !== "fp_viewmodel";
      /** Entering/leaving FP must not rebuild; leaving FP must rebuild so floor/interior mesh matches mode. */
      const bumpEpoch = !touchesFp || exitFp;
      return {
        mode,
        ...(bumpEpoch ? { contentStructureEpoch: s.contentStructureEpoch + 1 } : {}),
        ...(exitFp ? { fpSwingStrokeArmed: false } : {}),
      };
    }),
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
  setFpAuthorCamera: (fpAuthorCamera) => set({ fpAuthorCamera }),
  setFpAuthorTargetId: (fpAuthorTargetId) => set({ fpAuthorTargetId }),
  pickFpAuthorTarget: (fpAuthorTargetId) =>
    set((s) => ({
      fpAuthorTargetId,
      fpAuthorLive: s.fpAuthorLive + 1,
    })),
  setFpAuthorPitchRad: (fpAuthorPitchRad) => set({ fpAuthorPitchRad }),
  setFpAuthorInitMessage: (fpAuthorInitMessage) => set({ fpAuthorInitMessage }),
  bumpFpAuthorLive: () => set((s) => ({ fpAuthorLive: s.fpAuthorLive + 1 })),
  showFpAuthorToast: (message, ttlMs = 5200) => {
    set({ fpAuthorToast: message });
    setTimeout(() => {
      const cur = get().fpAuthorToast;
      if (cur === message) set({ fpAuthorToast: null });
    }, ttlMs);
  },
  setFpAuthorWeaponId: (fpAuthorWeaponId) =>
    set((s) => {
      if (s.fpAuthorWeaponId === fpAuthorWeaponId) return {};
      return {
        fpAuthorWeaponId,
        fpAuthorLive: s.fpAuthorLive + 1,
        fpSwingPreviewPhase01: 0,
        fpSwingKeyframesDraft: null,
        fpSwingPlayActive: false,
        fpSwingStrokeArmed: false,
      };
    }),
  setFpSwingPreviewPhase01: (fpSwingPreviewPhase01) =>
    set({
      fpSwingPreviewPhase01: Math.max(0, Math.min(1, fpSwingPreviewPhase01)),
    }),
  setFpSwingKeyframesDraft: (fpSwingKeyframesDraft) =>
    set((s) => ({ fpSwingKeyframesDraft, fpAuthorLive: s.fpAuthorLive + 1 })),
  setFpSwingPlayActive: (fpSwingPlayActive) => set({ fpSwingPlayActive }),
  setFpSwingStrokeArmed: (fpSwingStrokeArmed) => set({ fpSwingStrokeArmed }),
  setFpAuthorPickList: (next) =>
    set((s) => {
      const same =
        s.fpAuthorPickList.length === next.length &&
        next.every(
          (p, i) =>
            p.id === s.fpAuthorPickList[i]?.id && p.label === s.fpAuthorPickList[i]?.label,
        );
      if (same) return {};
      let fpAuthorTargetId = s.fpAuthorTargetId;
      if (next.length > 0 && !next.some((p) => p.id === fpAuthorTargetId)) {
        fpAuthorTargetId =
          next.find((p) => p.id === FP_AUTHOR_PREFERRED_TARGET_ID)?.id ?? next[0]!.id;
      }
      return {
        fpAuthorPickList: [...next],
        ...(fpAuthorTargetId !== s.fpAuthorTargetId ? { fpAuthorTargetId } : {}),
      };
    }),

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

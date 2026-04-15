import {
  BuildingDocSchema,
  CellDocSchema,
  ElevatorCabDefSchema,
  FloorDocSchema,
  FloorOverrideDocSchema,
  InteriorDocSchema,
  LandingKitDefSchema,
  PrefabDefSchema,
  StairWellDefSchema,
  type BuildingDoc,
  type CellDoc,
  type ElevatorCabDef,
  type FloorDoc,
  type FloorOverrideDoc,
  type InteriorDoc,
  type LandingKitDef,
  type PlacedObject,
  type PrefabDef,
  type StairWellDef,
} from "@the-mammoth/schemas";
import { create } from "zustand";
import type { FpAuthorWeaponId } from "../editor/weaponPresentationDiskSave.js";
import {
  FP_AUTHORABLE_CONSUMABLE_IDS,
  type FpAuthorConsumableId,
} from "../editor/consumablePresentationDiskSave.js";
import type { EditorContentIndex } from "../editor/editorContentDiscovery.js";
import {
  beginEditorTransactionGroup,
  cloneHistorySlice,
  commitEditorTransactionGroup,
  maybePushHistory,
} from "./editorStoreHistory.js";
import type {
  EditorCameraMode,
  EditorMode,
  EditorState,
  EditorWorkspace,
  FpAuthorCameraKind,
  FpAuthorPickMeta,
  FpAuthorSubjectKind,
  LandingDocKind,
  TransformMode,
} from "./editorStoreTypes.js";
import { landingDocKindToMode, workspaceToInitialMode } from "./editorWorkspaceMap.js";

export type {
  EditorCameraMode,
  EditorMaterialMeta,
  EditorMode,
  EditorState,
  EditorWorkspace,
  FpAuthorCameraKind,
  FpAuthorPickMeta,
  FpAuthorSubjectKind,
  HistoryEntry,
  LandingDocKind,
  TransformMode,
} from "./editorStoreTypes.js";
export type { FpAuthorConsumableId } from "../editor/consumablePresentationDiskSave.js";

/**
 * Dev-only: set to any {@link FpAuthorWeaponId} (`ALL_WEAPON_DEFINITIONS` in engine) so the editor
 * opens FP authoring on that weapon. `null` = use `DEFAULT_FP_AUTHOR_WEAPON_ID` (crowbar).
 */
const FP_AUTHOR_DEV_DEFAULT_WEAPON: FpAuthorWeaponId | null = null;

const DEFAULT_FP_AUTHOR_WEAPON_ID: FpAuthorWeaponId = "crowbar";

/** Default FP gizmo + orbit framing: weapon root vs grip (`firstPerson.mount` in JSON). */
export const FP_AUTHOR_PREFERRED_TARGET_ID = "weaponRoot";

const EMPTY_CONTENT_INDEX: EditorContentIndex = {
  buildingPath: "building/mammoth.json",
  floorDocIds: [],
  interiorDocIds: [],
  cellDocIds: [],
  prefabDefIds: [],
  floorOverrideDocIds: [],
  elevatorCabRelPath: "elevator/cab.json",
  landingKitRelPath: "elevator/landing_kit.json",
  stairWellRelPath: "elevator/stairwell.json",
};

const DEFAULT_ELEVATOR_CAB_DEF = ElevatorCabDefSchema.parse({
  id: "default_elevator_cab",
  version: 1,
});
const DEFAULT_LANDING_KIT_DEF = LandingKitDefSchema.parse({
  id: "default_landing_kit",
  version: 1,
});
const DEFAULT_STAIR_WELL_DEF = StairWellDefSchema.parse({
  id: "default_stair_well",
  version: 1,
});

export const useEditorStore = create<EditorState>((set, get) => ({
  workspace: "stairwell",
  landingDocKind: "kit",
  mode: "stairwell_preview",
  building: BuildingDocSchema.parse({ id: "mammoth_main", version: 1, floorRefs: [] }),
  floorDocs: {},
  interiorDocs: {},
  cellDocs: {},
  prefabDefs: {},
  floorOverrideDocs: {},
  elevatorCabDef: DEFAULT_ELEVATOR_CAB_DEF,
  landingKitDef: DEFAULT_LANDING_KIT_DEF,
  stairWellDef: DEFAULT_STAIR_WELL_DEF,
  contentIndex: EMPTY_CONTENT_INDEX,
  activeFloorDocId: "floor_mamutica_ground",
  activeInteriorDocId: "lobby_central",
  activeCellDocId: "cell_0_0",
  activePrefabDefId: null,
  activeFloorOverrideDocId: null,
  focusedStoryLevelIndex: 1,
  selectedId: null,
  dirty: false,
  collisionArtifactsStatus: null,
  transformMode: "translate",
  gridSnapM: 0,
  shadowsEnabled: false,
  useHdriEnvironment: true,
  cameraMode: "orbit",
  flySpeedMps: 18,
  stairWellAuthorScope: "typical",
  fpAuthorCamera: "orbit",
  fpAuthorSubjectKind: "weapon",
  fpAuthorTargetId: FP_AUTHOR_PREFERRED_TARGET_ID,
  /** 0 = same as client before mouse look (`mountFpSession` initial pitch). */
  fpAuthorPitchRad: 0,
  fpAuthorInitMessage: null,
  fpAuthorLive: 0,
  fpAuthorToast: null,
  fpAuthorPickList: [],
  fpAuthorWeaponId: FP_AUTHOR_DEV_DEFAULT_WEAPON ?? DEFAULT_FP_AUTHOR_WEAPON_ID,
  fpAuthorConsumableId: FP_AUTHORABLE_CONSUMABLE_IDS[0] as FpAuthorConsumableId,
  historyPast: [],
  historyFuture: [],
  contentStructureEpoch: 0,

  beginTransaction: () => {
    beginEditorTransactionGroup(get, set);
  },

  commitTransaction: () => {
    commitEditorTransactionGroup();
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
      cellDocs: prev.cellDocs,
      prefabDefs: prev.prefabDefs,
      floorOverrideDocs: prev.floorOverrideDocs,
      building: prev.building,
      elevatorCabDef: prev.elevatorCabDef,
      landingKitDef: prev.landingKitDef,
      stairWellDef: prev.stairWellDef,
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
      cellDocs: next.cellDocs,
      prefabDefs: next.prefabDefs,
      floorOverrideDocs: next.floorOverrideDocs,
      building: next.building,
      elevatorCabDef: next.elevatorCabDef,
      landingKitDef: next.landingKitDef,
      stairWellDef: next.stairWellDef,
      selectedId: next.selectedId,
      dirty: next.dirty,
      contentStructureEpoch: next.contentStructureEpoch ?? 0,
    });
  },

  setMode: (mode) =>
    set((s) => {
      if (s.mode === mode) return { mode };
      const isFpMode = (m: typeof mode) => m === "fp_viewmodel" || m === "fp_consumable";
      const touchesFp = isFpMode(s.mode) || isFpMode(mode);
      const exitFp = isFpMode(s.mode) && !isFpMode(mode);
      /** Entering/leaving FP must not rebuild; leaving FP must rebuild so floor/interior mesh matches mode. */
      const bumpEpoch = !touchesFp || exitFp;
      return {
        mode,
        ...(bumpEpoch ? { contentStructureEpoch: s.contentStructureEpoch + 1 } : {}),
      };
    }),

  setWorkspace: (workspace: EditorWorkspace) =>
    set((s) => {
      const mode = workspaceToInitialMode(workspace, s.landingDocKind);
      const isFpMode = (m: EditorMode) => m === "fp_viewmodel" || m === "fp_consumable";
      const touchesFp = isFpMode(s.mode) || isFpMode(mode);
      const exitFp = isFpMode(s.mode) && !isFpMode(mode);
      const bumpEpoch = !touchesFp || exitFp;
      const cameraMode: EditorCameraMode = "orbit";
      return {
        workspace,
        mode,
        cameraMode,
        ...(bumpEpoch ? { contentStructureEpoch: s.contentStructureEpoch + 1 } : {}),
      };
    }),

  setLandingDocKind: (landingDocKind: LandingDocKind) =>
    set((s) => {
      if (s.landingDocKind === landingDocKind) return { landingDocKind };
      const mode =
        s.workspace === "landing" ? landingDocKindToMode(landingDocKind) : s.mode;
      return {
        landingDocKind,
        mode,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    }),

  patchElevatorCabDef: (fn) => {
    maybePushHistory(get, set);
    set((s) => {
      const prev = s.elevatorCabDef;
      const next = fn(prev);
      /** Part-only edits sync via {@link applyElevatorCabPartTransforms}; avoid full mesh rebuild while dragging. */
      const needsRebuild =
        next.id !== prev.id ||
        next.version !== prev.version ||
        JSON.stringify(next.materials) !== JSON.stringify(prev.materials);
      return {
        elevatorCabDef: next,
        dirty: true,
        ...(needsRebuild ? { contentStructureEpoch: s.contentStructureEpoch + 1 } : {}),
      };
    });
  },

  patchLandingKitDef: (fn) => {
    maybePushHistory(get, set);
    set((s) => {
      const prev = s.landingKitDef;
      const next = fn(prev);
      /** Part-only edits sync via `applyLandingKitPartTransforms` (no full mesh rebuild). */
      const needsRebuild =
        next.id !== prev.id ||
        next.version !== prev.version ||
        next.exteriorSwingMaxRad !== prev.exteriorSwingMaxRad ||
        JSON.stringify(next.materials) !== JSON.stringify(prev.materials);
      return {
        landingKitDef: next,
        dirty: true,
        ...(needsRebuild ? { contentStructureEpoch: s.contentStructureEpoch + 1 } : {}),
      };
    });
  },
  patchStairWellDef: (fn) => {
    maybePushHistory(get, set);
    set((s) => {
      const prev = s.stairWellDef;
      const next = fn(prev);
      const needsRebuild =
        next.id !== prev.id ||
        next.version !== prev.version ||
        JSON.stringify(next.materials) !== JSON.stringify(prev.materials);
      return {
        stairWellDef: next,
        dirty: true,
        ...(needsRebuild ? { contentStructureEpoch: s.contentStructureEpoch + 1 } : {}),
      };
    });
  },
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
  setCellDoc: (id, doc) =>
    set((s) => ({
      cellDocs: { ...s.cellDocs, [id]: doc },
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),
  setPrefabDef: (id, doc) =>
    set((s) => ({
      prefabDefs: { ...s.prefabDefs, [id]: doc },
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),
  setFloorOverrideDoc: (id, doc) =>
    set((s) => ({
      floorOverrideDocs: { ...s.floorOverrideDocs, [id]: doc },
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
  setActiveCellDocId: (activeCellDocId) =>
    set((s) =>
      s.activeCellDocId === activeCellDocId
        ? { activeCellDocId }
        : { activeCellDocId, contentStructureEpoch: s.contentStructureEpoch + 1 },
    ),
  setActivePrefabDefId: (activePrefabDefId) =>
    set((s) =>
      s.activePrefabDefId === activePrefabDefId
        ? { activePrefabDefId }
        : { activePrefabDefId, contentStructureEpoch: s.contentStructureEpoch + 1 },
    ),
  setActiveFloorOverrideDocId: (activeFloorOverrideDocId) =>
    set((s) =>
      s.activeFloorOverrideDocId === activeFloorOverrideDocId
        ? { activeFloorOverrideDocId }
        : {
            activeFloorOverrideDocId,
            contentStructureEpoch: s.contentStructureEpoch + 1,
          },
    ),
  setFocusedStoryLevelIndex: (focusedStoryLevelIndex) => set({ focusedStoryLevelIndex }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setDirty: (dirty) => set({ dirty }),
  setCollisionArtifactsStatus: (collisionArtifactsStatus) => set({ collisionArtifactsStatus }),
  setTransformMode: (transformMode) => set({ transformMode }),
  setGridSnapM: (gridSnapM) => set({ gridSnapM }),
  setShadowsEnabled: (shadowsEnabled) => set({ shadowsEnabled }),
  setUseHdriEnvironment: (useHdriEnvironment) => set({ useHdriEnvironment }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setFlySpeedMps: (flySpeedMps) => set({ flySpeedMps }),
  setStairWellAuthorScope: (stairWellAuthorScope) =>
    set((s) => ({
      stairWellAuthorScope,
      ...(s.mode === "stairwell_preview" ? { contentStructureEpoch: s.contentStructureEpoch + 1 } : {}),
      ...(stairWellAuthorScope === "ground" && s.selectedId === "stair_corner_landing"
        ? { selectedId: null }
        : {}),
    })),
  setFpAuthorCamera: (fpAuthorCamera) => set({ fpAuthorCamera }),
  setFpAuthorSubjectKind: (fpAuthorSubjectKind: FpAuthorSubjectKind) =>
    set((s) => {
      if (s.fpAuthorSubjectKind === fpAuthorSubjectKind) return {};
      return {
        fpAuthorSubjectKind,
        fpAuthorLive: s.fpAuthorLive + 1,
      };
    }),
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
      };
    }),
  setFpAuthorConsumableId: (fpAuthorConsumableId) =>
    set((s) => {
      if (s.fpAuthorConsumableId === fpAuthorConsumableId) return {};
      return {
        fpAuthorConsumableId,
        fpAuthorLive: s.fpAuthorLive + 1,
      };
    }),
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
  getActiveCellDoc: () => get().cellDocs[get().activeCellDocId],
  getActivePrefabDef: () => {
    const id = get().activePrefabDefId;
    return id ? get().prefabDefs[id] : undefined;
  },
  getActiveFloorOverrideDoc: () => {
    const id = get().activeFloorOverrideDocId;
    return id ? get().floorOverrideDocs[id] : undefined;
  },

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

  updateCellPlacement: (cellDocId, entityId, patch) => {
    maybePushHistory(get, set);
    const structural =
      "prefabId" in patch ||
      "assetId" in patch ||
      "overrides" in patch;
    set((s) => {
      const cur = s.cellDocs[cellDocId];
      if (!cur) return s;
      const placements = cur.placements.map((p) =>
        p.entityId === entityId ? { ...p, ...patch } : p,
      );
      return {
        cellDocs: { ...s.cellDocs, [cellDocId]: { ...cur, placements } },
        dirty: true,
        ...(structural
          ? { contentStructureEpoch: s.contentStructureEpoch + 1 }
          : {}),
      };
    });
  },

  updatePrefabComponent: (prefabDefId, componentId, patch) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.prefabDefs[prefabDefId];
      if (!cur) return s;
      const components = cur.components.map((p) =>
        p.id === componentId ? { ...p, ...patch } : p,
      );
      return {
        prefabDefs: { ...s.prefabDefs, [prefabDefId]: { ...cur, components } },
        dirty: true,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  updateFloorOverrideObjectPatch: (overrideDocId, targetObjectId, patch) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.floorOverrideDocs[overrideDocId];
      if (!cur) return s;
      const existing = cur.objectPatches.find((row) => row.targetObjectId === targetObjectId);
      const nextPatch = { ...(existing?.patch ?? {}), ...patch };
      const objectPatches = existing
        ? cur.objectPatches.map((row) =>
            row.targetObjectId === targetObjectId ? { ...row, patch: nextPatch } : row,
          )
        : [...cur.objectPatches, { targetObjectId, patch: nextPatch }];
      return {
        floorOverrideDocs: {
          ...s.floorOverrideDocs,
          [overrideDocId]: { ...cur, objectPatches },
        },
        dirty: true,
        contentStructureEpoch: s.contentStructureEpoch + 1,
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

  addCellPlacement: (cellDocId, row) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.cellDocs[cellDocId];
      if (!cur) return s;
      return {
        cellDocs: {
          ...s.cellDocs,
          [cellDocId]: { ...cur, placements: [...cur.placements, row] },
        },
        dirty: true,
        selectedId: row.entityId,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  deleteCellPlacement: (cellDocId, entityId) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.cellDocs[cellDocId];
      if (!cur) return s;
      return {
        cellDocs: {
          ...s.cellDocs,
          [cellDocId]: {
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

  duplicateCellPlacement: (cellDocId, entityId) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.cellDocs[cellDocId];
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
        cellDocs: {
          ...s.cellDocs,
          [cellDocId]: { ...cur, placements: [...cur.placements, copy] },
        },
        dirty: true,
        selectedId: copy.entityId,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  addPrefabComponent: (prefabDefId, row) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.prefabDefs[prefabDefId];
      if (!cur) return s;
      return {
        prefabDefs: {
          ...s.prefabDefs,
          [prefabDefId]: { ...cur, components: [...cur.components, row] },
        },
        dirty: true,
        selectedId: row.id,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  deletePrefabComponent: (prefabDefId, componentId) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.prefabDefs[prefabDefId];
      if (!cur) return s;
      return {
        prefabDefs: {
          ...s.prefabDefs,
          [prefabDefId]: {
            ...cur,
            components: cur.components.filter((p) => p.id !== componentId),
          },
        },
        dirty: true,
        selectedId: s.selectedId === componentId ? null : s.selectedId,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    });
  },

  duplicatePrefabComponent: (prefabDefId, componentId) => {
    maybePushHistory(get, set);
    set((s) => {
      const cur = s.prefabDefs[prefabDefId];
      if (!cur) return s;
      const src = cur.components.find((p) => p.id === componentId);
      if (!src) return s;
      const copy = {
        ...src,
        id: crypto.randomUUID(),
        position: [
          src.position[0] + 1,
          src.position[1],
          src.position[2] + 1,
        ] as PlacedObject["position"],
      };
      return {
        prefabDefs: {
          ...s.prefabDefs,
          [prefabDefId]: { ...cur, components: [...cur.components, copy] },
        },
        dirty: true,
        selectedId: copy.id,
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

  replaceCellDocFromRemote: (id, doc) =>
    set((s) => ({
      cellDocs: { ...s.cellDocs, [id]: CellDocSchema.parse(doc) },
      dirty: false,
      historyPast: [],
      historyFuture: [],
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),

  replacePrefabDefFromRemote: (id, doc) =>
    set((s) => ({
      prefabDefs: { ...s.prefabDefs, [id]: PrefabDefSchema.parse(doc) },
      dirty: false,
      historyPast: [],
      historyFuture: [],
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),

  replaceFloorOverrideDocFromRemote: (id, doc) =>
    set((s) => ({
      floorOverrideDocs: {
        ...s.floorOverrideDocs,
        [id]: FloorOverrideDocSchema.parse(doc),
      },
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

  replaceElevatorCabDefFromRemote: (doc) =>
    set((s) => ({
      elevatorCabDef: ElevatorCabDefSchema.parse(doc),
      dirty: false,
      historyPast: [],
      historyFuture: [],
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),

  replaceLandingKitDefFromRemote: (doc) =>
    set((s) => ({
      landingKitDef: LandingKitDefSchema.parse(doc),
      dirty: false,
      historyPast: [],
      historyFuture: [],
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),
  replaceStairWellDefFromRemote: (doc) =>
    set((s) => ({
      stairWellDef: StairWellDefSchema.parse(doc),
      dirty: false,
      historyPast: [],
      historyFuture: [],
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),
}));

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

export function collectPrefabIdsFromCells(cellDocs: Record<string, CellDoc>): string[] {
  const s = new Set<string>();
  for (const d of Object.values(cellDocs)) {
    for (const p of d.placements) {
      if (p.prefabId) s.add(p.prefabId);
    }
  }
  return [...s].sort();
}

export function collectPrefabIdsFromPrefabDefs(prefabDefs: Record<string, PrefabDef>): string[] {
  const s = new Set<string>();
  for (const d of Object.values(prefabDefs)) {
    s.add(d.id);
    for (const c of d.components) {
      if (c.prefabId) s.add(c.prefabId);
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

export function serializeCellDocPretty(doc: CellDoc): string {
  return `${JSON.stringify(CellDocSchema.parse(doc), null, 2)}\n`;
}

export function serializePrefabDefPretty(doc: PrefabDef): string {
  return `${JSON.stringify(PrefabDefSchema.parse(doc), null, 2)}\n`;
}

export function serializeFloorOverrideDocPretty(doc: FloorOverrideDoc): string {
  return `${JSON.stringify(FloorOverrideDocSchema.parse(doc), null, 2)}\n`;
}

export function serializeBuildingDocPretty(doc: BuildingDoc): string {
  return `${JSON.stringify(BuildingDocSchema.parse(doc), null, 2)}\n`;
}

export function serializeElevatorCabDefPretty(doc: ElevatorCabDef): string {
  return `${JSON.stringify(ElevatorCabDefSchema.parse(doc), null, 2)}\n`;
}

export function serializeLandingKitDefPretty(doc: LandingKitDef): string {
  return `${JSON.stringify(LandingKitDefSchema.parse(doc), null, 2)}\n`;
}

export function serializeStairWellDefPretty(doc: StairWellDef): string {
  return `${JSON.stringify(StairWellDefSchema.parse(doc), null, 2)}\n`;
}

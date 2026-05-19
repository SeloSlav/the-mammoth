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
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  OwnedApartmentBuiltinsDocSchema,
  finalizeOwnedApartmentBuiltinsDoc,
  type OwnedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import { create } from "zustand";
import type { FpAuthorWeaponId } from "../editor/fpAuthoring/weaponPresentationDiskSave.js";
import {
  FP_AUTHORABLE_CONSUMABLE_IDS,
  type FpAuthorConsumableId,
} from "../editor/fpAuthoring/consumablePresentationDiskSave.js";
import {
  beginEditorTransactionGroup,
  cloneHistorySlice,
  commitEditorTransactionGroup,
  maybePushHistory,
} from "./editorStoreHistory.js";
import {
  DEFAULT_APARTMENT_KIT_DEF,
  DEFAULT_BUILDING,
  DEFAULT_ELEVATOR_CAB_DEF,
  DEFAULT_LANDING_KIT_DEF,
  DEFAULT_STAIR_WELL_DEF,
  EMPTY_CONTENT_INDEX,
} from "./editorStoreSeedValues.js";
import type {
  EditorCameraMode,
  EditorMode,
  EditorState,
  EditorWorkspace,
  FpAuthorSubjectKind,
  LandingDocKind,
  LandingKitVariant,
} from "./editorStoreTypes.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForSavedObjectGroup,
  parseMyApartmentLayoutDecorSelectedId,
  parseMyApartmentLayoutMirrorSelectedId,
  parseMyApartmentLayoutSavedObjectGroupId,
  parseMyApartmentLayoutWallSelectedId,
} from "../editor/myApartment/editorMyApartmentSelection.js";
import { computeApartmentPlacementCanvasPick } from "../editor/myApartment/apartmentLayoutSelectionOps.js";
import { cloneMyApartmentObjectGroupInDoc } from "../editor/myApartment/cloneMyApartmentObjectGroup.js";
import {
  deleteMyApartmentLayoutPlacementsInDoc,
  deleteMyApartmentObjectGroupMembersInDoc,
} from "../editor/myApartment/deleteMyApartmentLayoutPlacements.js";
import { preserveOwnedApartmentMountPlacementRefs } from "../editor/myApartment/preserveOwnedApartmentMountPlacementRefs.js";
import {
  landingDocKindToMode,
  workspaceToInitialMode,
} from "./editorWorkspaceMap.js";

function scheduleOwnedApartmentBuiltinsObjectGroupDiskFlush(): void {
  ownedApartmentBuiltinsFlushScheduled = true;
  if (ownedApartmentBuiltinsFlushTimer !== null) return;
  ownedApartmentBuiltinsFlushTimer = setTimeout(() => {
    ownedApartmentBuiltinsFlushTimer = null;
    if (!ownedApartmentBuiltinsFlushScheduled) return;
    ownedApartmentBuiltinsFlushScheduled = false;
    void import("../editor/persistence/flushOwnedApartmentBuiltinsToDisk.js")
      .then((m) => m.flushOwnedApartmentBuiltinsToDisk())
      .catch((err) => {
        console.warn("[editor] Auto-save owned_apartment_builtins.json failed:", err);
      });
  }, 600);
}

let ownedApartmentBuiltinsFlushTimer: ReturnType<typeof setTimeout> | null = null;
let ownedApartmentBuiltinsFlushScheduled = false;

function finalizeOwnedApartmentBuiltinsPreservingMounts(
  prev: OwnedApartmentBuiltinsDoc,
  draft: OwnedApartmentBuiltinsDoc,
): OwnedApartmentBuiltinsDoc {
  return preserveOwnedApartmentMountPlacementRefs(
    prev,
    finalizeOwnedApartmentBuiltinsDoc(OwnedApartmentBuiltinsDocSchema.parse(draft)),
  );
}

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
  LandingKitVariant,
  TransformMode,
} from "./editorStoreTypes.js";
export type { FpAuthorConsumableId } from "../editor/fpAuthoring/consumablePresentationDiskSave.js";

/**
 * Dev-only: set to any {@link FpAuthorWeaponId} (`ALL_WEAPON_DEFINITIONS` in engine) so the editor
 * opens FP authoring on that weapon. `null` = use `DEFAULT_FP_AUTHOR_WEAPON_ID` (crowbar).
 */
const FP_AUTHOR_DEV_DEFAULT_WEAPON: FpAuthorWeaponId | null = null;

const DEFAULT_FP_AUTHOR_WEAPON_ID: FpAuthorWeaponId = "crowbar";

/** Default FP gizmo + orbit framing: weapon root vs grip (`firstPerson.mount` in JSON). */
export const FP_AUTHOR_PREFERRED_TARGET_ID = "weapon";

export const useEditorStore = create<EditorState>((set, get) => ({
  workspace: "stairwell",
  landingDocKind: "kit",
  mode: "stairwell_preview",
  building: DEFAULT_BUILDING,
  floorDocs: {},
  interiorDocs: {},
  cellDocs: {},
  prefabDefs: {},
  floorOverrideDocs: {},
  elevatorCabDef: DEFAULT_ELEVATOR_CAB_DEF,
  landingKitDef: DEFAULT_LANDING_KIT_DEF,
  inactiveLandingKitDef: DEFAULT_APARTMENT_KIT_DEF,
  landingKitVariant: "elevator" as LandingKitVariant,
  stairWellDef: DEFAULT_STAIR_WELL_DEF,
  contentIndex: EMPTY_CONTENT_INDEX,
  activeFloorDocId: "floor_mamutica_ground",
  activeInteriorDocId: "lobby_central",
  activeCellDocId: "cell_0_0",
  activePrefabDefId: null,
  activeFloorOverrideDocId: null,
  focusedStoryLevelIndex: 1,
  selectedId: null,
  myApartmentMultiselectExtraIds: [] as readonly string[],
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
  ownedApartmentBuiltins: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  ownedApartmentBuiltinsNeedsDiskFlush: false,
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
      inactiveLandingKitDef: prev.inactiveLandingKitDef,
      landingKitVariant: prev.landingKitVariant,
      stairWellDef: prev.stairWellDef,
      ownedApartmentBuiltins: prev.ownedApartmentBuiltins,
      selectedId: prev.selectedId,
      myApartmentMultiselectExtraIds: prev.myApartmentMultiselectExtraIds ?? [],
      dirty: prev.dirty,
      ownedApartmentBuiltinsNeedsDiskFlush: prev.ownedApartmentBuiltinsNeedsDiskFlush,
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
      inactiveLandingKitDef: next.inactiveLandingKitDef,
      landingKitVariant: next.landingKitVariant,
      stairWellDef: next.stairWellDef,
      ownedApartmentBuiltins: next.ownedApartmentBuiltins,
      selectedId: next.selectedId,
      myApartmentMultiselectExtraIds: next.myApartmentMultiselectExtraIds ?? [],
      dirty: next.dirty,
      ownedApartmentBuiltinsNeedsDiskFlush: next.ownedApartmentBuiltinsNeedsDiskFlush,
      contentStructureEpoch: next.contentStructureEpoch ?? 0,
    });
  },

  setMode: (mode) =>
    set((s) => {
      if (s.mode === mode) return { mode };
      const isFpMode = (m: typeof mode) =>
        m === "fp_viewmodel" || m === "fp_consumable";
      const touchesFp = isFpMode(s.mode) || isFpMode(mode);
      const exitFp = isFpMode(s.mode) && !isFpMode(mode);
      /** Entering/leaving FP must not rebuild; leaving FP must rebuild so floor/interior mesh matches mode. */
      const bumpEpoch = !touchesFp || exitFp;
      return {
        mode,
        ...(bumpEpoch
          ? { contentStructureEpoch: s.contentStructureEpoch + 1 }
          : {}),
      };
    }),

  setWorkspace: (workspace: EditorWorkspace) =>
    set((s) => {
      const mode = workspaceToInitialMode(workspace, s.landingDocKind);
      const isFpMode = (m: EditorMode) =>
        m === "fp_viewmodel" || m === "fp_consumable";
      const touchesFp = isFpMode(s.mode) || isFpMode(mode);
      const exitFp = isFpMode(s.mode) && !isFpMode(mode);
      const bumpEpoch = !touchesFp || exitFp;
      const cameraMode: EditorCameraMode = "orbit";
      return {
        workspace,
        mode,
        cameraMode,
        ...(bumpEpoch
          ? { contentStructureEpoch: s.contentStructureEpoch + 1 }
          : {}),
      };
    }),

  setLandingDocKind: (landingDocKind: LandingDocKind) =>
    set((s) => {
      if (s.landingDocKind === landingDocKind) return { landingDocKind };
      const mode =
        s.workspace === "landing"
          ? landingDocKindToMode(landingDocKind)
          : s.mode;
      return {
        landingDocKind,
        mode,
        contentStructureEpoch: s.contentStructureEpoch + 1,
      };
    }),

  setLandingKitVariant: (variant: LandingKitVariant) => {
    const s = get();
    if (s.landingKitVariant === variant) return;
    maybePushHistory(get, set);
    set((st) => ({
      landingKitVariant: variant,
      landingKitDef: st.inactiveLandingKitDef,
      inactiveLandingKitDef: st.landingKitDef,
      selectedId: null,
      contentStructureEpoch: st.contentStructureEpoch + 1,
    }));
  },

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
        ...(needsRebuild
          ? { contentStructureEpoch: s.contentStructureEpoch + 1 }
          : {}),
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
        ...(needsRebuild
          ? { contentStructureEpoch: s.contentStructureEpoch + 1 }
          : {}),
      };
    });
  },
  patchStairWellDef: (fn) => {
    maybePushHistory(get, set);
    set((s) => {
      const prev = s.stairWellDef;
      const next = fn(prev);
      const entryOpeningChanged =
        JSON.stringify(next.entryOpening) !==
          JSON.stringify(prev.entryOpening) ||
        JSON.stringify(next.groundEntryOpening) !==
          JSON.stringify(prev.groundEntryOpening) ||
        JSON.stringify(next.secondaryEntryOpening) !==
          JSON.stringify(prev.secondaryEntryOpening);
      const needsRebuild =
        next.id !== prev.id ||
        next.version !== prev.version ||
        JSON.stringify(next.materials) !== JSON.stringify(prev.materials) ||
        (entryOpeningChanged && s.mode !== "stairwell_preview");
      return {
        stairWellDef: next,
        dirty: true,
        ...(needsRebuild
          ? { contentStructureEpoch: s.contentStructureEpoch + 1 }
          : {}),
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
        : {
            activeCellDocId,
            contentStructureEpoch: s.contentStructureEpoch + 1,
          },
    ),
  setActivePrefabDefId: (activePrefabDefId) =>
    set((s) =>
      s.activePrefabDefId === activePrefabDefId
        ? { activePrefabDefId }
        : {
            activePrefabDefId,
            contentStructureEpoch: s.contentStructureEpoch + 1,
          },
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
  setFocusedStoryLevelIndex: (focusedStoryLevelIndex) =>
    set({ focusedStoryLevelIndex }),
  setSelectedId: (selectedId) =>
    set((s) => {
      const clearedMulti =
        s.mode === "my_apartment_layout"
          ? { myApartmentMultiselectExtraIds: [] as readonly string[] }
          : {};
      return { selectedId, ...clearedMulti };
    }),

  enterMyApartmentLayoutMode: () =>
    set((s) => {
      const items = s.ownedApartmentBuiltins.placedItems;
      const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
      const selectedId =
        sorted.length > 0 ? editorMyApartmentSelectedIdForDecor(sorted[0]!.id) : null;
      return {
        mode: "my_apartment_layout",
        selectedId,
        myApartmentMultiselectExtraIds: [],
        contentStructureEpoch: s.contentStructureEpoch + 1,
        ...(s.transformMode === "scale" ? { transformMode: "translate" as const } : {}),
      };
    }),

  pickMyApartmentLayoutFromCanvas: (clickedPlacementId, opts) =>
    set((s) => {
      if (s.mode !== "my_apartment_layout") return {};
      if (clickedPlacementId === null) {
        return { selectedId: null, myApartmentMultiselectExtraIds: [] as const };
      }
      const out = computeApartmentPlacementCanvasPick({
        clickedId: clickedPlacementId,
        additive: opts.additive,
        previousSelectedId: s.selectedId,
        previousExtras: s.myApartmentMultiselectExtraIds,
      });
      const next: Partial<typeof s> = {
        selectedId: out.selectedId,
        myApartmentMultiselectExtraIds: out.myApartmentMultiselectExtraIds,
      };
      return next;
    }),

  saveMyApartmentObjectGroupFromSelection: (rawName: string) => {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    const st0 = get();
    if (st0.mode !== "my_apartment_layout" || name.length === 0) return;

    const multiset = new Set<string>();
    if (typeof st0.selectedId === "string") multiset.add(st0.selectedId);
    for (const x of st0.myApartmentMultiselectExtraIds) multiset.add(x);
    const groupable = [...multiset].filter(
      (id) =>
        parseMyApartmentLayoutDecorSelectedId(id) !== null ||
        parseMyApartmentLayoutWallSelectedId(id) !== null ||
        parseMyApartmentLayoutMirrorSelectedId(id) !== null,
    );
    groupable.sort((a, b) => a.localeCompare(b));
    if (groupable.length < 2) return;

    maybePushHistory(get, set);

    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `apt_grp_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const docBefore = st0.ownedApartmentBuiltins;

    set(() => ({
      ownedApartmentBuiltins: finalizeOwnedApartmentBuiltinsPreservingMounts(
        docBefore,
        {
          ...docBefore,
          objectGroups: [
            ...docBefore.objectGroups,
            {
              id,
              name,
              memberSelectedIds: [...groupable],
            },
          ],
        },
      ),
      dirty: true,
      ownedApartmentBuiltinsNeedsDiskFlush: true,
      selectedId: editorMyApartmentSelectedIdForSavedObjectGroup(id),
      myApartmentMultiselectExtraIds: [],
    }));
    scheduleOwnedApartmentBuiltinsObjectGroupDiskFlush();
  },

  renameMyApartmentObjectGroup: (groupId, rawName) => {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!groupId || name.length === 0) return;
    const prior = get();
    if (
      prior.mode !== "my_apartment_layout" ||
      !prior.ownedApartmentBuiltins.objectGroups.some((g) => g.id === groupId)
    ) {
      return;
    }

    maybePushHistory(get, set);
    set((st) => {
      const next = finalizeOwnedApartmentBuiltinsPreservingMounts(st.ownedApartmentBuiltins, {
        ...st.ownedApartmentBuiltins,
        objectGroups: st.ownedApartmentBuiltins.objectGroups.map((g) =>
          g.id === groupId ? { ...g, name } : g,
        ),
      });
      return {
        ownedApartmentBuiltins: next,
        dirty: true,
        ownedApartmentBuiltinsNeedsDiskFlush: true,
      };
    });
    scheduleOwnedApartmentBuiltinsObjectGroupDiskFlush();
  },

  deleteMyApartmentObjectGroup: (groupId) => {
    if (!groupId) return;
    const prior = get();
    if (
      prior.mode !== "my_apartment_layout" ||
      !prior.ownedApartmentBuiltins.objectGroups.some((g) => g.id === groupId)
    ) {
      return;
    }

    maybePushHistory(get, set);

    set((st) => {
      const next = finalizeOwnedApartmentBuiltinsPreservingMounts(st.ownedApartmentBuiltins, {
        ...st.ownedApartmentBuiltins,
        objectGroups: st.ownedApartmentBuiltins.objectGroups.filter((g) => g.id !== groupId),
      });
      let selectedIdNext = st.selectedId;
      let extrasNext = st.myApartmentMultiselectExtraIds;
      if (parseMyApartmentLayoutSavedObjectGroupId(selectedIdNext) === groupId) {
        selectedIdNext = null;
        extrasNext = [];
      }
      return {
        ownedApartmentBuiltins: next,
        dirty: true,
        ownedApartmentBuiltinsNeedsDiskFlush: true,
        selectedId: selectedIdNext,
        myApartmentMultiselectExtraIds: extrasNext,
      };
    });
    scheduleOwnedApartmentBuiltinsObjectGroupDiskFlush();
  },

  cloneMyApartmentObjectGroup: (groupId) => {
    if (!groupId) return;
    const prior = get();
    if (
      prior.mode !== "my_apartment_layout" ||
      !prior.ownedApartmentBuiltins.objectGroups.some((g) => g.id === groupId)
    ) {
      return;
    }

    const cloned = cloneMyApartmentObjectGroupInDoc(prior.ownedApartmentBuiltins, groupId);
    if (!cloned) return;

    maybePushHistory(get, set);

    set(() => ({
      ownedApartmentBuiltins: finalizeOwnedApartmentBuiltinsPreservingMounts(
        prior.ownedApartmentBuiltins,
        cloned.doc,
      ),
      dirty: true,
      ownedApartmentBuiltinsNeedsDiskFlush: true,
      selectedId: editorMyApartmentSelectedIdForSavedObjectGroup(cloned.newGroupId),
      myApartmentMultiselectExtraIds: [],
    }));
    scheduleOwnedApartmentBuiltinsObjectGroupDiskFlush();
  },

  deleteMyApartmentObjectGroupMembers: (groupId) => {
    if (!groupId) return false;
    const prior = get();
    if (prior.mode !== "my_apartment_layout") return false;

    const nextDoc = deleteMyApartmentObjectGroupMembersInDoc(
      prior.ownedApartmentBuiltins,
      groupId,
    );
    if (!nextDoc) return false;

    maybePushHistory(get, set);
    set(() => ({
      ownedApartmentBuiltins: finalizeOwnedApartmentBuiltinsPreservingMounts(
        prior.ownedApartmentBuiltins,
        nextDoc,
      ),
      dirty: true,
      ownedApartmentBuiltinsNeedsDiskFlush: true,
      selectedId: null,
      myApartmentMultiselectExtraIds: [],
    }));
    scheduleOwnedApartmentBuiltinsObjectGroupDiskFlush();
    return true;
  },

  deleteMyApartmentLayoutSelection: () => {
    const prior = get();
    if (prior.mode !== "my_apartment_layout") return false;

    const groupId = parseMyApartmentLayoutSavedObjectGroupId(prior.selectedId);
    if (groupId) {
      return get().deleteMyApartmentObjectGroupMembers(groupId);
    }

    const selectedIds: string[] = [];
    if (typeof prior.selectedId === "string") selectedIds.push(prior.selectedId);
    for (const extra of prior.myApartmentMultiselectExtraIds) selectedIds.push(extra);

    const nextDoc = deleteMyApartmentLayoutPlacementsInDoc(
      prior.ownedApartmentBuiltins,
      selectedIds,
    );
    if (!nextDoc) return false;

    maybePushHistory(get, set);
    set(() => ({
      ownedApartmentBuiltins: finalizeOwnedApartmentBuiltinsPreservingMounts(
        prior.ownedApartmentBuiltins,
        nextDoc,
      ),
      dirty: true,
      ownedApartmentBuiltinsNeedsDiskFlush: true,
      selectedId: null,
      myApartmentMultiselectExtraIds: [],
    }));
    scheduleOwnedApartmentBuiltinsObjectGroupDiskFlush();
    return true;
  },

  selectMyApartmentSavedObjectGroup: (groupId) => {
    if (!groupId) return;
    set((st) => {
      if (st.mode !== "my_apartment_layout") return {};
      const def = st.ownedApartmentBuiltins.objectGroups.find((g) => g.id === groupId);
      if (!def || def.memberSelectedIds.length === 0) return {};

      return {
        selectedId: editorMyApartmentSelectedIdForSavedObjectGroup(groupId),
        myApartmentMultiselectExtraIds: [] as readonly string[],
      };
    });
  },

  patchOwnedApartmentBuiltins: (fn) => {
    maybePushHistory(get, set);
    set((s) => {
      const parsedNext = OwnedApartmentBuiltinsDocSchema.parse(fn(s.ownedApartmentBuiltins));
      const finalized = finalizeOwnedApartmentBuiltinsDoc(parsedNext);
      const next = preserveOwnedApartmentMountPlacementRefs(
        s.ownedApartmentBuiltins,
        finalized,
      );
      const placementChanged =
        next.placedItems !== s.ownedApartmentBuiltins.placedItems ||
        next.wallItems !== s.ownedApartmentBuiltins.wallItems ||
        next.mirrorItems !== s.ownedApartmentBuiltins.mirrorItems ||
        next.previewSizeM !== s.ownedApartmentBuiltins.previewSizeM;

      let selectedFix = s.selectedId;
      let extrasFix = s.myApartmentMultiselectExtraIds;
      if (
        typeof selectedFix === "string" &&
        parseMyApartmentLayoutSavedObjectGroupId(selectedFix)
      ) {
        const grp = parseMyApartmentLayoutSavedObjectGroupId(selectedFix)!;
        if (!next.objectGroups.some((g) => g.id === grp)) {
          selectedFix = null;
          extrasFix = [];
        }
      }

      const bumpPreview = next.previewSizeM !== s.ownedApartmentBuiltins.previewSizeM;
      return {
        ownedApartmentBuiltins: next,
        dirty: true,
        ...(placementChanged ? { ownedApartmentBuiltinsNeedsDiskFlush: true } : {}),
        ...(selectedFix !== s.selectedId ? { selectedId: selectedFix } : {}),
        ...(extrasFix !== s.myApartmentMultiselectExtraIds
          ? { myApartmentMultiselectExtraIds: extrasFix }
          : {}),
        ...(bumpPreview ? { contentStructureEpoch: s.contentStructureEpoch + 1 } : {}),
      };
    });
  },

  clearOwnedApartmentBuiltinsDiskFlushFlag: () =>
    set({ ownedApartmentBuiltinsNeedsDiskFlush: false }),

  setDirty: (dirty) => set({ dirty }),
  setCollisionArtifactsStatus: (collisionArtifactsStatus) =>
    set({ collisionArtifactsStatus }),
  setTransformMode: (transformMode) => set({ transformMode }),
  setGridSnapM: (gridSnapM) => set({ gridSnapM }),
  setShadowsEnabled: (shadowsEnabled) => set({ shadowsEnabled }),
  setUseHdriEnvironment: (useHdriEnvironment) => set({ useHdriEnvironment }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setFlySpeedMps: (flySpeedMps) => set({ flySpeedMps }),
  setStairWellAuthorScope: (stairWellAuthorScope) =>
    set((s) => ({
      stairWellAuthorScope,
      ...(s.mode === "stairwell_preview"
        ? { contentStructureEpoch: s.contentStructureEpoch + 1 }
        : {}),
      ...((stairWellAuthorScope === "ground" &&
        (s.selectedId === "stair_landing_lower" ||
          s.selectedId === "stair_corner_landing" ||
          s.selectedId === "stair_entry_opening_proxy_secondary")) ||
      (stairWellAuthorScope === "typical" && s.selectedId === "shaft_floor")
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
            p.id === s.fpAuthorPickList[i]?.id &&
            p.label === s.fpAuthorPickList[i]?.label,
        );
      if (same) return {};
      let fpAuthorTargetId = s.fpAuthorTargetId;
      if (next.length > 0 && !next.some((p) => p.id === fpAuthorTargetId)) {
        fpAuthorTargetId =
          next.find((p) => p.id === FP_AUTHOR_PREFERRED_TARGET_ID)?.id ??
          next[0]!.id;
      }
      return {
        fpAuthorPickList: [...next],
        ...(fpAuthorTargetId !== s.fpAuthorTargetId
          ? { fpAuthorTargetId }
          : {}),
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
      "prefabId" in patch || "assetId" in patch || "overrides" in patch;
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
      "prefabId" in patch || "assetId" in patch || "overrides" in patch;
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
      const existing = cur.objectPatches.find(
        (row) => row.targetObjectId === targetObjectId,
      );
      const nextPatch = { ...(existing?.patch ?? {}), ...patch };
      const objectPatches = existing
        ? cur.objectPatches.map((row) =>
            row.targetObjectId === targetObjectId
              ? { ...row, patch: nextPatch }
              : row,
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
    set((s) => {
      const parsed = LandingKitDefSchema.parse(doc);
      if (s.landingKitVariant === "elevator") {
        return {
          landingKitDef: parsed,
          dirty: false,
          historyPast: [],
          historyFuture: [],
          contentStructureEpoch: s.contentStructureEpoch + 1,
        };
      }
      return {
        inactiveLandingKitDef: parsed,
        dirty: false,
        historyPast: [],
        historyFuture: [],
      };
    }),
  replaceApartmentKitDefFromRemote: (doc) =>
    set((s) => {
      const parsed = LandingKitDefSchema.parse(doc);
      if (s.landingKitVariant === "apartment") {
        return {
          landingKitDef: parsed,
          dirty: false,
          historyPast: [],
          historyFuture: [],
          contentStructureEpoch: s.contentStructureEpoch + 1,
        };
      }
      return {
        inactiveLandingKitDef: parsed,
        dirty: false,
        historyPast: [],
        historyFuture: [],
      };
    }),
  replaceStairWellDefFromRemote: (doc) =>
    set((s) => ({
      stairWellDef: StairWellDefSchema.parse(doc),
      dirty: false,
      historyPast: [],
      historyFuture: [],
      contentStructureEpoch: s.contentStructureEpoch + 1,
    })),
}));

export {
  collectPrefabIdsFromCells,
  collectPrefabIdsFromFloors,
  collectPrefabIdsFromInteriors,
  collectPrefabIdsFromPrefabDefs,
} from "./editorStoreCollectPrefabIds.js";
export {
  serializeBuildingDocPretty,
  serializeCellDocPretty,
  serializeElevatorCabDefPretty,
  serializeFloorDocPretty,
  serializeFloorOverrideDocPretty,
  serializeInteriorDocPretty,
  serializeLandingKitDefPretty,
  serializePrefabDefPretty,
  serializeStairWellDefPretty,
  serializeOwnedApartmentBuiltinsDocPretty,
} from "./editorStoreDocSerialize.js";

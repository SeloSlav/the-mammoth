import type {
  BuildingDoc,
  CellDoc,
  ElevatorCabDef,
  FloorDoc,
  FloorOverrideDoc,
  InteriorDoc,
  LandingKitDef,
  PlacedObject,
  PrefabDef,
  StairWellDef,
} from "@the-mammoth/schemas";
import type { FpAuthorWeaponId } from "../editor/weaponPresentationDiskSave.js";
import type { FpAuthorConsumableId } from "../editor/consumablePresentationDiskSave.js";
import type { StairWellAuthoringScope } from "@the-mammoth/world";
import type {
  CollisionArtifactsStatus,
  EditorContentIndex,
} from "../editor/editorContentDiscovery.js";

/** Top-level authoring surface (3-button UX). */
export type EditorWorkspace = "cab" | "landing" | "stairwell" | "world";

/** Landing workspace: shared door kit vs streamed documents. */
export type LandingDocKind = "kit" | "interior" | "cell" | "prefab" | "floor_override";

/**
 * Which swing-door kit the `landing_preview` mode is currently authoring.
 *
 * Both kits share `LandingKitDef`; only the save destination and runtime consumer differ:
 * - `elevator` → `content/elevator/landing_kit.json`, used by `fpElevatorWorld`
 * - `apartment` → `content/door/apartment_unit_kit.json`, used by `fpApartmentDoors`
 *
 * The editor swaps `landingKitDef` ⇄ `inactiveLandingKitDef` when this changes so every existing
 * `s.landingKitDef` consumer sees the active kit — no downstream refactor required.
 */
export type LandingKitVariant = "elevator" | "apartment";

export type EditorMode =
  | "floor"
  | "interior"
  | "cell"
  | "prefab"
  | "floor_override"
  | "fp_viewmodel"
  | "fp_consumable"
  | "cab"
  | "landing_preview"
  | "stairwell_preview";

export type EditorCameraMode = "orbit" | "fly";

export type FpAuthorCameraKind = "gameplay" | "orbit";

export type FpAuthorSubjectKind = "weapon" | "consumable";

export type TransformMode = "translate" | "rotate" | "scale";

export type FpAuthorPickMeta = { id: string; label: string };

export type EditorMaterialMeta = {
  mapUrl?: string;
  normalMapUrl?: string;
  roughnessMapUrl?: string;
  metalnessMapUrl?: string;
  bumpMapUrl?: string;
  roughness?: number;
  metalness?: number;
};

export type HistoryEntry = {
  floorDocs: Record<string, FloorDoc>;
  interiorDocs: Record<string, InteriorDoc>;
  cellDocs: Record<string, CellDoc>;
  prefabDefs: Record<string, PrefabDef>;
  floorOverrideDocs: Record<string, FloorOverrideDoc>;
  building: BuildingDoc;
  elevatorCabDef: ElevatorCabDef;
  landingKitDef: LandingKitDef;
  inactiveLandingKitDef: LandingKitDef;
  landingKitVariant: LandingKitVariant;
  stairWellDef: StairWellDef;
  selectedId: string | null;
  dirty: boolean;
  contentStructureEpoch: number;
};

export interface EditorState {
  workspace: EditorWorkspace;
  landingDocKind: LandingDocKind;
  /** Which kit `landingKitDef` currently holds. */
  landingKitVariant: LandingKitVariant;
  mode: EditorMode;
  building: BuildingDoc;
  floorDocs: Record<string, FloorDoc>;
  interiorDocs: Record<string, InteriorDoc>;
  cellDocs: Record<string, CellDoc>;
  prefabDefs: Record<string, PrefabDef>;
  floorOverrideDocs: Record<string, FloorOverrideDoc>;
  elevatorCabDef: ElevatorCabDef;
  /** Active kit (elevator or apartment, per {@link landingKitVariant}). */
  landingKitDef: LandingKitDef;
  /** Parked copy of the non-active kit so a variant swap is just two assignments. */
  inactiveLandingKitDef: LandingKitDef;
  stairWellDef: StairWellDef;
  contentIndex: EditorContentIndex;
  activeFloorDocId: string;
  activeInteriorDocId: string;
  activeCellDocId: string;
  activePrefabDefId: string | null;
  activeFloorOverrideDocId: string | null;
  focusedStoryLevelIndex: number;
  selectedId: string | null;
  dirty: boolean;
  collisionArtifactsStatus: CollisionArtifactsStatus | null;
  transformMode: TransformMode;
  gridSnapM: number;
  shadowsEnabled: boolean;
  useHdriEnvironment: boolean;
  cameraMode: EditorCameraMode;
  flySpeedMps: number;
  stairWellAuthorScope: StairWellAuthoringScope;
  fpAuthorCamera: FpAuthorCameraKind;
  fpAuthorSubjectKind: FpAuthorSubjectKind;
  fpAuthorTargetId: string;
  fpAuthorPitchRad: number;
  fpAuthorInitMessage: string | null;
  fpAuthorLive: number;
  fpAuthorToast: string | null;
  fpAuthorPickList: readonly FpAuthorPickMeta[];
  fpAuthorWeaponId: FpAuthorWeaponId;
  fpAuthorConsumableId: FpAuthorConsumableId;
  contentStructureEpoch: number;
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];

  beginTransaction: () => void;
  commitTransaction: () => void;
  undo: () => void;
  redo: () => void;

  setMode: (mode: EditorMode) => void;
  setWorkspace: (workspace: EditorWorkspace) => void;
  setLandingDocKind: (kind: LandingDocKind) => void;
  /**
   * Swap active kit to `variant`. The currently-edited `landingKitDef` is parked into
   * `inactiveLandingKitDef`, and the previously-parked kit becomes active. No-op if already active.
   */
  setLandingKitVariant: (variant: LandingKitVariant) => void;
  patchElevatorCabDef: (fn: (d: ElevatorCabDef) => ElevatorCabDef) => void;
  patchLandingKitDef: (fn: (d: LandingKitDef) => LandingKitDef) => void;
  patchStairWellDef: (fn: (d: StairWellDef) => StairWellDef) => void;
  setBuilding: (doc: BuildingDoc) => void;
  patchBuilding: (fn: (b: BuildingDoc) => BuildingDoc) => void;
  setFloorDoc: (id: string, doc: FloorDoc) => void;
  setInteriorDoc: (id: string, doc: InteriorDoc) => void;
  setCellDoc: (id: string, doc: CellDoc) => void;
  setPrefabDef: (id: string, doc: PrefabDef) => void;
  setFloorOverrideDoc: (id: string, doc: FloorOverrideDoc) => void;
  setActiveFloorDocId: (id: string) => void;
  setActiveInteriorDocId: (id: string) => void;
  setActiveCellDocId: (id: string) => void;
  setActivePrefabDefId: (id: string | null) => void;
  setActiveFloorOverrideDocId: (id: string | null) => void;
  setFocusedStoryLevelIndex: (level: number) => void;
  setSelectedId: (id: string | null) => void;
  setDirty: (dirty: boolean) => void;
  setCollisionArtifactsStatus: (status: CollisionArtifactsStatus | null) => void;
  setTransformMode: (m: TransformMode) => void;
  setGridSnapM: (m: number) => void;
  setShadowsEnabled: (on: boolean) => void;
  setUseHdriEnvironment: (on: boolean) => void;
  setCameraMode: (mode: EditorCameraMode) => void;
  setFlySpeedMps: (speed: number) => void;
  setStairWellAuthorScope: (scope: StairWellAuthoringScope) => void;
  setFpAuthorCamera: (c: FpAuthorCameraKind) => void;
  setFpAuthorSubjectKind: (kind: FpAuthorSubjectKind) => void;
  setFpAuthorTargetId: (id: string) => void;
  pickFpAuthorTarget: (id: string) => void;
  setFpAuthorPitchRad: (r: number) => void;
  setFpAuthorInitMessage: (m: string | null) => void;
  bumpFpAuthorLive: () => void;
  setFpAuthorPickList: (list: readonly FpAuthorPickMeta[]) => void;
  setFpAuthorWeaponId: (id: FpAuthorWeaponId) => void;
  setFpAuthorConsumableId: (id: FpAuthorConsumableId) => void;
  showFpAuthorToast: (message: string, ttlMs?: number) => void;

  getActiveFloorDoc: () => FloorDoc | undefined;
  getActiveInteriorDoc: () => InteriorDoc | undefined;
  getActiveCellDoc: () => CellDoc | undefined;
  getActivePrefabDef: () => PrefabDef | undefined;
  getActiveFloorOverrideDoc: () => FloorOverrideDoc | undefined;

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
  updateCellPlacement: (
    cellDocId: string,
    entityId: string,
    patch: Partial<{
      position: PlacedObject["position"];
      rotation: NonNullable<PlacedObject["rotation"]>;
      scale: NonNullable<PlacedObject["scale"]>;
      prefabId: string;
      overrides: Record<string, unknown> | undefined;
    }>,
  ) => void;
  updatePrefabComponent: (
    prefabDefId: string,
    componentId: string,
    patch: Partial<{
      position: PlacedObject["position"];
      rotation: NonNullable<PlacedObject["rotation"]>;
      scale: NonNullable<PlacedObject["scale"]>;
      prefabId: string;
      assetId: string;
      metadata: Record<string, unknown> | undefined;
    }>,
  ) => void;
  updateFloorOverrideObjectPatch: (
    overrideDocId: string,
    targetObjectId: string,
    patch: Partial<{
      prefabId: string;
      position: PlacedObject["position"];
      rotation: NonNullable<PlacedObject["rotation"]>;
      scale: NonNullable<PlacedObject["scale"]>;
      metadata: Record<string, unknown> | undefined;
    }>,
  ) => void;

  addFloorObject: (floorDocId: string, obj: PlacedObject) => void;
  deleteFloorObject: (floorDocId: string, objectId: string) => void;
  duplicateFloorObject: (floorDocId: string, objectId: string) => void;

  addInteriorPlacement: (interiorDocId: string, row: InteriorDoc["placements"][number]) => void;
  deleteInteriorPlacement: (interiorDocId: string, entityId: string) => void;
  duplicateInteriorPlacement: (interiorDocId: string, entityId: string) => void;
  addCellPlacement: (cellDocId: string, row: CellDoc["placements"][number]) => void;
  deleteCellPlacement: (cellDocId: string, entityId: string) => void;
  duplicateCellPlacement: (cellDocId: string, entityId: string) => void;
  addPrefabComponent: (prefabDefId: string, row: PrefabDef["components"][number]) => void;
  deletePrefabComponent: (prefabDefId: string, componentId: string) => void;
  duplicatePrefabComponent: (prefabDefId: string, componentId: string) => void;

  replaceFloorDocFromRemote: (id: string, doc: FloorDoc) => void;
  replaceInteriorDocFromRemote: (id: string, doc: InteriorDoc) => void;
  replaceCellDocFromRemote: (id: string, doc: CellDoc) => void;
  replacePrefabDefFromRemote: (id: string, doc: PrefabDef) => void;
  replaceFloorOverrideDocFromRemote: (id: string, doc: FloorOverrideDoc) => void;
  replaceBuildingFromRemote: (doc: BuildingDoc) => void;
  replaceElevatorCabDefFromRemote: (doc: ElevatorCabDef) => void;
  replaceLandingKitDefFromRemote: (doc: LandingKitDef) => void;
  /** Reset the apartment-door kit from disk; routes to the active or parked slot based on variant. */
  replaceApartmentKitDefFromRemote: (doc: LandingKitDef) => void;
  replaceStairWellDefFromRemote: (doc: StairWellDef) => void;
}

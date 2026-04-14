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
} from "@the-mammoth/schemas";
import type { FpAuthorWeaponId } from "../editor/weaponPresentationDiskSave.js";
import type { FpAuthorConsumableId } from "../editor/consumablePresentationDiskSave.js";
import type {
  CollisionArtifactsStatus,
  EditorContentIndex,
} from "../editor/editorContentDiscovery.js";

/** Top-level authoring surface (3-button UX). */
export type EditorWorkspace = "cab" | "landing" | "world";

/** Landing workspace: shared door kit vs streamed documents. */
export type LandingDocKind = "kit" | "interior" | "cell" | "prefab" | "floor_override";

export type EditorMode =
  | "floor"
  | "interior"
  | "cell"
  | "prefab"
  | "floor_override"
  | "fp_viewmodel"
  | "fp_consumable"
  | "cab"
  | "landing_preview";

export type EditorCameraMode = "orbit" | "fly";

export type FpAuthorCameraKind = "gameplay" | "orbit";

export type FpAuthorSubjectKind = "weapon" | "consumable";

export type TransformMode = "translate" | "rotate" | "scale";

export type FpAuthorPickMeta = { id: string; label: string };

export type EditorMaterialMeta = {
  mapUrl?: string;
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
  selectedId: string | null;
  dirty: boolean;
  contentStructureEpoch: number;
};

export interface EditorState {
  workspace: EditorWorkspace;
  landingDocKind: LandingDocKind;
  mode: EditorMode;
  building: BuildingDoc;
  floorDocs: Record<string, FloorDoc>;
  interiorDocs: Record<string, InteriorDoc>;
  cellDocs: Record<string, CellDoc>;
  prefabDefs: Record<string, PrefabDef>;
  floorOverrideDocs: Record<string, FloorOverrideDoc>;
  elevatorCabDef: ElevatorCabDef;
  landingKitDef: LandingKitDef;
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
  patchElevatorCabDef: (fn: (d: ElevatorCabDef) => ElevatorCabDef) => void;
  patchLandingKitDef: (fn: (d: LandingKitDef) => LandingKitDef) => void;
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
}

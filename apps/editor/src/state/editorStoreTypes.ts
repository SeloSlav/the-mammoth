import type {
  BuildingDoc,
  FloorDoc,
  InteriorDoc,
  PlacedObject,
} from "@the-mammoth/schemas";
import type { FpAuthorWeaponId } from "../editor/weaponPresentationDiskSave.js";

export type EditorMode = "floor" | "interior" | "fp_viewmodel";

export type FpAuthorCameraKind = "gameplay" | "orbit";

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
  building: BuildingDoc;
  selectedId: string | null;
  dirty: boolean;
  contentStructureEpoch: number;
};

export interface EditorState {
  mode: EditorMode;
  building: BuildingDoc;
  floorDocs: Record<string, FloorDoc>;
  interiorDocs: Record<string, InteriorDoc>;
  activeFloorDocId: string;
  activeInteriorDocId: string;
  focusedStoryLevelIndex: number;
  selectedId: string | null;
  dirty: boolean;
  transformMode: TransformMode;
  gridSnapM: number;
  shadowsEnabled: boolean;
  useHdriEnvironment: boolean;
  fpAuthorCamera: FpAuthorCameraKind;
  fpAuthorTargetId: string;
  fpAuthorPitchRad: number;
  fpAuthorInitMessage: string | null;
  fpAuthorLive: number;
  fpAuthorToast: string | null;
  fpAuthorPickList: readonly FpAuthorPickMeta[];
  fpAuthorWeaponId: FpAuthorWeaponId;
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
  pickFpAuthorTarget: (id: string) => void;
  setFpAuthorPitchRad: (r: number) => void;
  setFpAuthorInitMessage: (m: string | null) => void;
  bumpFpAuthorLive: () => void;
  setFpAuthorPickList: (list: readonly FpAuthorPickMeta[]) => void;
  setFpAuthorWeaponId: (id: FpAuthorWeaponId) => void;
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

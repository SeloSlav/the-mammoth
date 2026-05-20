import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import { TYPICAL_FLOOR_DOC_ID } from "@the-mammoth/world";
import type { EditorState } from "../../state/editorStoreTypes.js";
import { ownedApartmentWallItemsDeepEqual } from "./preserveOwnedApartmentMountPlacementRefs.js";

/** Inputs that require rebuilding the apartment authoring mount (not selection / saved groups). */
export type ApartmentMountSyncInputs = {
  mode: EditorState["mode"];
  contentStructureEpoch: number;
  typicalFloorDoc: FloorDoc | undefined;
  building: BuildingDoc;
  previewSizeM: number;
  placedItems: OwnedApartmentBuiltinsDoc["placedItems"];
  wallItems: OwnedApartmentBuiltinsDoc["wallItems"];
  mirrorItems: OwnedApartmentBuiltinsDoc["mirrorItems"];
};

export function captureApartmentMountSyncInputs(st: EditorState): ApartmentMountSyncInputs {
  return {
    mode: st.mode,
    contentStructureEpoch: st.contentStructureEpoch ?? 0,
    typicalFloorDoc: st.floorDocs[TYPICAL_FLOOR_DOC_ID],
    building: st.building,
    previewSizeM: st.ownedApartmentBuiltins.previewSizeM,
    placedItems: st.ownedApartmentBuiltins.placedItems,
    wallItems: st.ownedApartmentBuiltins.wallItems,
    mirrorItems: st.ownedApartmentBuiltins.mirrorItems,
  };
}

export function apartmentMountSyncInputsChanged(
  prev: ApartmentMountSyncInputs,
  next: ApartmentMountSyncInputs,
): boolean {
  return classifyApartmentMountSyncChange(prev, next) !== "none";
}

export type ApartmentMountSyncChange =
  | "none"
  | "decor-only"
  | "walls-only"
  | "mirrors-only"
  | "full";

/** Whether the 3D mount must fully remount or can patch placements in place. */
export function classifyApartmentMountSyncChange(
  prev: ApartmentMountSyncInputs,
  next: ApartmentMountSyncInputs,
): ApartmentMountSyncChange {
  const structural =
    prev.mode !== next.mode ||
    prev.contentStructureEpoch !== next.contentStructureEpoch ||
    prev.typicalFloorDoc !== next.typicalFloorDoc ||
    prev.building !== next.building ||
    prev.previewSizeM !== next.previewSizeM;
  if (structural) return "full";

  const decorChanged = prev.placedItems !== next.placedItems;
  const wallsChanged =
    prev.wallItems !== next.wallItems ||
    !ownedApartmentWallItemsDeepEqual(prev.wallItems, next.wallItems);
  const mirrorsChanged = prev.mirrorItems !== next.mirrorItems;
  const changeCount =
    (decorChanged ? 1 : 0) + (wallsChanged ? 1 : 0) + (mirrorsChanged ? 1 : 0);
  if (changeCount === 0) return "none";
  if (changeCount > 1) return "full";
  if (decorChanged) return "decor-only";
  if (wallsChanged) return "walls-only";
  return "mirrors-only";
}

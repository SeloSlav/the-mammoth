import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import { TYPICAL_FLOOR_DOC_ID } from "@the-mammoth/world";
import type { EditorState } from "../../state/editorStoreTypes.js";

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
  return (
    prev.mode !== next.mode ||
    prev.contentStructureEpoch !== next.contentStructureEpoch ||
    prev.typicalFloorDoc !== next.typicalFloorDoc ||
    prev.building !== next.building ||
    prev.previewSizeM !== next.previewSizeM ||
    prev.placedItems !== next.placedItems ||
    prev.wallItems !== next.wallItems ||
    prev.mirrorItems !== next.mirrorItems
  );
}

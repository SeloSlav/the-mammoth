import * as THREE from "three";
import type { MyApartmentLayoutPiece } from "../../state/editorStoreTypes.js";
import { editorMyApartmentSelectedIdForPiece } from "./editorMyApartmentSelection.js";

let groupsRef: Record<string, THREE.Group> | null = null;

export function setEditorMyApartmentPieceGroups(
  next: Record<string, THREE.Group> | null,
): void {
  groupsRef = next;
}

export function getEditorMyApartmentPieceGroup(
  piece: MyApartmentLayoutPiece,
): THREE.Group | null {
  return groupsRef?.[editorMyApartmentSelectedIdForPiece(piece)] ?? null;
}

export function getEditorMyApartmentSelectionGroup(
  selectedId: string | null,
): THREE.Group | null {
  return selectedId ? (groupsRef?.[selectedId] ?? null) : null;
}

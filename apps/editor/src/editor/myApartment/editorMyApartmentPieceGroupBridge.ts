import * as THREE from "three";
import type { MyApartmentLayoutPiece } from "../../state/editorStoreTypes.js";

let groupsRef: Record<MyApartmentLayoutPiece, THREE.Group> | null = null;

export function setEditorMyApartmentPieceGroups(
  next: Record<MyApartmentLayoutPiece, THREE.Group> | null,
): void {
  groupsRef = next;
}

export function getEditorMyApartmentPieceGroup(
  piece: MyApartmentLayoutPiece,
): THREE.Group | null {
  return groupsRef?.[piece] ?? null;
}

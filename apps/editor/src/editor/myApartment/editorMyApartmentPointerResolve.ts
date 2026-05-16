import type { Object3D } from "three";
import type { MyApartmentLayoutPiece } from "../../state/editorStoreTypes.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForPiece,
  editorMyApartmentSelectedIdForWall,
} from "./editorMyApartmentSelection.js";

export function resolveEditorMyApartmentLayoutPick(hit: Object3D): {
  id: string;
  target: Object3D;
} | null {
  let o: Object3D | null = hit;
  while (o) {
    const piece = o.userData.mammothEditorMyApartmentPiece as string | undefined;
    if (piece) {
      return {
        target: o,
        id: editorMyApartmentSelectedIdForPiece(piece as MyApartmentLayoutPiece),
      };
    }
    const decorId = o.userData.mammothEditorMyApartmentDecorId as string | undefined;
    if (decorId) {
      return {
        target: o,
        id: editorMyApartmentSelectedIdForDecor(decorId),
      };
    }
    const wallId = o.userData.mammothEditorMyApartmentWallId as string | undefined;
    if (wallId) {
      return {
        target: o,
        id: editorMyApartmentSelectedIdForWall(wallId),
      };
    }
    o = o.parent;
  }
  return null;
}

import type { Object3D } from "three";
import type { MyApartmentLayoutPiece } from "../../state/editorStoreTypes.js";
import { editorMyApartmentSelectedIdForPiece } from "./editorMyApartmentSelection.js";

export function resolveEditorMyApartmentLayoutPick(hit: Object3D): {
  id: string;
  target: Object3D;
  piece: MyApartmentLayoutPiece;
} | null {
  let o: Object3D | null = hit;
  while (o) {
    const piece = o.userData.mammothEditorMyApartmentPiece as
      | MyApartmentLayoutPiece
      | undefined;
    if (piece) {
      return {
        piece,
        target: o,
        id: editorMyApartmentSelectedIdForPiece(piece),
      };
    }
    o = o.parent;
  }
  return null;
}

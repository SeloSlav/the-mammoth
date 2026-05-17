import type { Object3D } from "three";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForWall,
} from "./editorMyApartmentSelection.js";

export function resolveEditorMyApartmentLayoutPick(hit: Object3D): {
  id: string;
  target: Object3D;
} | null {
  let o: Object3D | null = hit;
  while (o) {
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

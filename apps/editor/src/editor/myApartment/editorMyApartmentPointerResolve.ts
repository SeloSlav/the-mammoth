import * as THREE from "three";
import {
  EDITOR_MY_APARTMENT_WALL_OPENING_PROXY_UD,
} from "@the-mammoth/world";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForWall,
  editorMyApartmentSelectedIdForWallOpening,
} from "./editorMyApartmentSelection.js";

export function resolveEditorMyApartmentLayoutPick(hit: THREE.Object3D): {
  id: string;
  target: THREE.Object3D;
} | null {
  let o: THREE.Object3D | null = hit;
  while (o) {
    if (o.userData[EDITOR_MY_APARTMENT_WALL_OPENING_PROXY_UD] === true) {
      const openingId = o.userData.mammothEditorMyApartmentWallOpeningId as string | undefined;
      let wallWalk: THREE.Object3D | null = o.parent;
      while (wallWalk) {
        const wallId = wallWalk.userData.mammothEditorMyApartmentWallId as string | undefined;
        if (wallId && openingId) {
          return {
            target: o,
            id: editorMyApartmentSelectedIdForWallOpening(wallId, openingId),
          };
        }
        wallWalk = wallWalk.parent;
      }
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
    const mirrorId = o.userData.mammothEditorMyApartmentMirrorId as string | undefined;
    if (mirrorId) {
      return {
        target: o,
        id: editorMyApartmentSelectedIdForMirror(mirrorId),
      };
    }
    o = o.parent;
  }
  return null;
}

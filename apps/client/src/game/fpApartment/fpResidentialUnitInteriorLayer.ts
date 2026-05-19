import * as THREE from "three";
import {
  tagMergedResidentialShellMeshes as tagMergedResidentialShellMeshesBase,
  tagMeshResidentialUnitInterior as tagMeshResidentialUnitInteriorBase,
  tagResidentialUnitInteriorMeshesUnder as tagResidentialUnitInteriorMeshesUnderBase,
} from "@the-mammoth/engine";
import { FP_APARTMENT_DECOR_PROP_LAYER } from "../fpSession/fpSessionConstants.js";
import {
  APARTMENT_MIRROR_SURFACE_USERDATA_KEY,
  MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY,
} from "@the-mammoth/world";

export {
  tagMeshResidentialUnitInteriorBase as tagMeshResidentialUnitInterior,
  tagResidentialUnitInteriorMeshesUnderBase as tagResidentialUnitInteriorMeshesUnder,
  tagMergedResidentialShellMeshesBase as tagMergedResidentialShellMeshes,
};

function isApartmentPlanarMirrorRenderMesh(mesh: THREE.Mesh): boolean {
  return (
    mesh.userData.mammothCabMirror === true ||
    mesh.userData[MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY] === true ||
    mesh.userData[APARTMENT_MIRROR_SURFACE_USERDATA_KEY] === true
  );
}

function isApartmentDecorOrFurniturePropAncestor(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (
      cur.userData.mammothApartmentDecorProp === true
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

/**
 * Move heavy apartment props off the interior shell layer so mirror reflection cameras can omit them.
 * Call after {@link tagResidentialUnitInteriorMeshesUnder}. Planar mirror glass stays on layer 3.
 */
/** Planar mirror glass stays on the shell layer; other decor props move to layer 5. */
export function tagApartmentDecorPropMeshesForMirrorExclusion(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (isApartmentPlanarMirrorRenderMesh(obj)) return;
    if (!isApartmentDecorOrFurniturePropAncestor(obj)) return;
    obj.layers.set(FP_APARTMENT_DECOR_PROP_LAYER);
  });
}

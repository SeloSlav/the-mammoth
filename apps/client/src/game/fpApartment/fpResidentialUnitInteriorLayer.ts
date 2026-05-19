import * as THREE from "three";
import {
  APARTMENT_MIRROR_SURFACE_USERDATA_KEY,
  MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY,
} from "@the-mammoth/world";
import {
  FP_APARTMENT_DECOR_PROP_LAYER,
  FP_RESIDENTIAL_UNIT_INTERIOR_LAYER,
} from "../fpSession/fpSessionConstants.js";

/** Residential shell / props only — corridor meshes stay on layer 0 so hallway lighting does not “flood” flats through open doors. */
export function tagMeshResidentialUnitInterior(mesh: THREE.Mesh): void {
  mesh.layers.set(FP_RESIDENTIAL_UNIT_INTERIOR_LAYER);
}

/** Tag every mesh under `root` (post-merge safe — merged furniture meshes default to layer 0). */
export function tagResidentialUnitInteriorMeshesUnder(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) tagMeshResidentialUnitInterior(obj);
  });
}

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
      cur.userData.mammothApartmentDecorProp === true ||
      cur.userData.mammothApartmentFurnitureProp === true
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
export function tagApartmentDecorPropMeshesForMirrorExclusion(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (isApartmentPlanarMirrorRenderMesh(obj)) return;
    if (!isApartmentDecorOrFurniturePropAncestor(obj)) return;
    obj.layers.set(FP_APARTMENT_DECOR_PROP_LAYER);
  });
}

/** Merged hollow-room shells tagged `mammothPlacedObjectId` = `unit_*`. */
export function tagMergedResidentialShellMeshes(buildingRoot: THREE.Object3D): void {
  buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const pid = obj.userData.mammothPlacedObjectId;
    if (typeof pid !== "string") return;
    if (!pid.startsWith("unit_")) return;
    tagMeshResidentialUnitInterior(obj);
  });
}

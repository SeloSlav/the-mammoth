import * as THREE from "three";
import { FP_RESIDENTIAL_UNIT_INTERIOR_LAYER } from "../fpSession/fpSessionConstants.js";

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

/** Merged hollow-room shells tagged `mammothPlacedObjectId` = `unit_e_*` / `unit_w_*`. */
export function tagMergedResidentialShellMeshes(buildingRoot: THREE.Object3D): void {
  buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const pid = obj.userData.mammothPlacedObjectId;
    if (typeof pid !== "string") return;
    if (!pid.startsWith("unit_e_") && !pid.startsWith("unit_w_")) return;
    tagMeshResidentialUnitInterior(obj);
  });
}

import * as THREE from "three";
import { getMammothDroppedWorldTargetMaxDimM } from "@the-mammoth/assets";

const MIN_REASONABLE_MESH_BB_DIM_M = 0.02;

/**
 * Uniform scale + Y shift so the longest AABB edge matches the catalog target (meters) and
 * the mesh rests on the placement Y from the server (`@the-mammoth/assets` sizing table).
 */
export function fitDroppedWorldItemModelToCatalog(object: THREE.Object3D, defId: string): void {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, MIN_REASONABLE_MESH_BB_DIM_M);
  const targetM = getMammothDroppedWorldTargetMaxDimM(defId);
  const s = targetM / maxDim;
  object.scale.multiplyScalar(s);

  object.updateWorldMatrix(true, true);
  const boxAfter = new THREE.Box3().setFromObject(object);
  object.position.y -= boxAfter.min.y;
}

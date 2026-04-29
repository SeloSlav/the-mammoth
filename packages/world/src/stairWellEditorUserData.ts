import * as THREE from "three";
import type { StairWellAuthoringScope, StairWellEditorPartId } from "./stairWellEditorIds.js";

export const LEGACY_STAIR_CORNER_LANDING_PART_ID = "stair_corner_landing";

export function setStairWellEditorPartId(
  obj: THREE.Object3D,
  partId: StairWellEditorPartId,
  scope: StairWellAuthoringScope,
): void {
  obj.userData.editorStairPartId = partId;
  obj.userData.editorStairAuthoringScope = scope;
  obj.userData.editorStairBasePosition = [
    obj.position.x,
    obj.position.y,
    obj.position.z,
  ] as const;
  obj.userData.editorStairBaseScale = [
    obj.scale.x,
    obj.scale.y,
    obj.scale.z,
  ] as const;
  obj.userData.editorStairBaseRotation = [
    obj.quaternion.x,
    obj.quaternion.y,
    obj.quaternion.z,
    obj.quaternion.w,
  ] as const;
}

export function setStairWellEditorPickId(obj: THREE.Object3D, partId: StairWellEditorPartId): void {
  obj.userData.editorStairPickId = partId;
}

export function recordStairWellBaseTransforms(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const partId = obj.userData.editorStairPartId as StairWellEditorPartId | undefined;
    if (!partId) return;
    const scope =
      (obj.userData.editorStairAuthoringScope as StairWellAuthoringScope | undefined) ??
      "typical";
    setStairWellEditorPartId(obj, partId, scope);
  });
}

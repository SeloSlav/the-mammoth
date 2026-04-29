import * as THREE from "three";
import type { DecalPlacement } from "./decalTypes.js";

/**
 * Dev-only helper: raycast from camera through pointer, log a {@link DecalPlacement} JSON snippet.
 * Heavy editor UI intentionally omitted (see plan).
 */
export function debugDumpDecalPlacementFromPointer(args: {
  camera: THREE.Camera;
  pointerNdc: THREE.Vector2;
  targetMeshes: THREE.Mesh[];
}): DecalPlacement | undefined {
  if (!import.meta.env.DEV) return undefined;
  const { camera, pointerNdc, targetMeshes } = args;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObjects(targetMeshes, false)[0];
  if (!hit || !hit.face) return undefined;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
  const placement: DecalPlacement = {
    id: "blok47_a",
    category: "graffiti",
    mode: "projected",
    position: [hit.point.x, hit.point.y, hit.point.z],
    normal: [n.x, n.y, n.z],
    rotation: 0,
    size: [0.95, 0.95, 0.35],
  };
  console.debug("[DecalPlacementTool]", JSON.stringify(placement, null, 2));
  return placement;
}

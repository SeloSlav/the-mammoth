import * as THREE from "three";

const EXPANDED_PAD_USERDATA_KEY = "mammothFrustumBoundsExpandedPadM";

/**
 * Inflate mesh bounds so frustum culling stays enabled without near-plane pops on large shells.
 * Idempotent per mesh for a given padding value.
 */
export function expandMeshFrustumBoundsOnce(mesh: THREE.Mesh, paddingM: number): void {
  if (paddingM <= 0) return;
  if (mesh.userData[EXPANDED_PAD_USERDATA_KEY] === paddingM) return;
  mesh.userData[EXPANDED_PAD_USERDATA_KEY] = paddingM;
  const geometry = mesh.geometry as THREE.BufferGeometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius += paddingM;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  geometry.boundingBox?.expandByScalar(paddingM);
}

export function expandObjectFrustumBoundsOnce(root: THREE.Object3D, paddingM: number): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) expandMeshFrustumBoundsOnce(obj, paddingM);
  });
}

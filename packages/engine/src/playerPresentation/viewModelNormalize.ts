import * as THREE from "three";

/**
 * Former FP placeholder: forearm box depth ~0.56m; fist on the end — hand GLB should read ~0.3m max edge.
 * Crowbar primitive total span ~0.55m along shaft + hook.
 */
export const FP_HAND_GLTF_MAX_EDGE_M = 0.32;
export const FP_CROWBAR_GLTF_MAX_EDGE_M = 0.54;
export const TP_CROWBAR_GLTF_MAX_EDGE_M = 0.62;

/** Uniform positive scale from AABB longest edge → `maxEdgeMeters`. */
export function setMaxEdgeUniformScale(root: THREE.Object3D, maxEdgeMeters: number): void {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim < 1e-8) return;
  root.scale.setScalar(maxEdgeMeters / maxDim);
}

/**
 * Same as {@link setMaxEdgeUniformScale} but **negates X** (reflect across YZ) for right-hand FP read.
 * Inverts winding — pair with {@link forceDoubleSidedMeshes} until export chirality is fixed.
 */
export function setMaxEdgeScaleMirrorX(root: THREE.Object3D, maxEdgeMeters: number): void {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim < 1e-8) return;
  const u = maxEdgeMeters / maxDim;
  root.scale.set(-u, u, u);
}

export function forceDoubleSidedMeshes(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if ("side" in mat && mat.side !== undefined) {
        (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      }
    }
  });
}

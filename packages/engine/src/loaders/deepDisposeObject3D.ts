import * as THREE from "three";

/**
 * Dispose geometries and materials under `root`.
 * Only for subtrees you fully own (direct GLTF loads, procedural meshes).
 *
 * Do **not** use on {@link GltfModelLoadRegistry} instances — `scene.clone(true)` shares GPU
 * buffers with the cached template; disposing a clone destroys the template too.
 */
export function deepDisposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mat = m.material;
      if (!Array.isArray(mat)) mat?.dispose();
      else mat.forEach((x) => x.dispose());
    }
  });
}

/** Remove a registry clone from the scene without freeing shared template GPU assets. */
export function detachRegistryCloneSubtree(root: THREE.Object3D): void {
  root.removeFromParent();
  root.clear();
}

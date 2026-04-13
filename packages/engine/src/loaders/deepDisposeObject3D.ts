import * as THREE from "three";

/** Dispose geometries and materials under `root` (typical GLB clone teardown). */
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

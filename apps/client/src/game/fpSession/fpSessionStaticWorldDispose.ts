import * as THREE from "three";

/**
 * Deep-dispose Mesh GPU resources under a static-world root (geometries + materials).
 * Used when tearing down the shared megablock cache or the FP session — not for everyday unparenting.
 */
export function disposeStaticWorldObjectTree(root: THREE.Object3D): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = obj.geometry as THREE.BufferGeometry | undefined;
    if (geometry && !disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry);
      geometry.dispose();
    }
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!material || disposedMaterials.has(material)) continue;
      disposedMaterials.add(material);
      material.dispose();
    }
  });
}

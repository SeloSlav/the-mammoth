import * as THREE from "three";

const TEXTURE_KEYS: (keyof THREE.MeshStandardMaterial)[] = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "bumpMap",
  "displacementMap",
  "emissiveMap",
  "lightMap",
  "alphaMap",
  "envMap",
];

/** Disposes GPU resources held by a Three.js `Texture` (safe on nullish). */
export function disposeTexture(tex: THREE.Texture | null | undefined): void {
  tex?.dispose();
}

/**
 * Disposes a material and any standard map textures attached to it (MeshStandard/WebGPU nodes
 * use the same `.map` fields for reference counting).
 */
export function disposeMaterial(
  material: THREE.Material | THREE.Material[] | null | undefined,
): void {
  if (!material) return;
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    if ("dispose" in mat && typeof mat.dispose === "function") {
      if (
        mat instanceof THREE.MeshStandardMaterial ||
        mat instanceof THREE.MeshPhysicalMaterial ||
        mat instanceof THREE.MeshPhongMaterial
      ) {
        const surface = mat as unknown as Record<
          (typeof TEXTURE_KEYS)[number],
          THREE.Texture | undefined
        >;
        for (const key of TEXTURE_KEYS) {
          const t = surface[key];
          if (t instanceof THREE.Texture) t.dispose();
        }
      }
      mat.dispose();
    }
  }
}

/**
 * Depth-first disposal of geometries, materials, and embedded textures for every mesh under `object`.
 * Use when unloading a merged floor plate, apartment section, or disposable preview root.
 */
export function disposeObject3D(object: THREE.Object3D | null | undefined): void {
  if (!object) return;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      disposeMaterial(child.material);
    } else if (
      child instanceof THREE.Line ||
      child instanceof THREE.LineLoop ||
      child instanceof THREE.LineSegments
    ) {
      child.geometry?.dispose();
      disposeMaterial(child.material);
    } else if (child instanceof THREE.Points) {
      child.geometry?.dispose();
      disposeMaterial(child.material);
    }
  });
}

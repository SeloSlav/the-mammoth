import * as THREE from "three";

/** Disposes GPU-heavy resources under `root` (geometries, materials, common maps). */
export function disposeSubtreeGpuAssets(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.map?.dispose();
        mat.normalMap?.dispose();
        mat.roughnessMap?.dispose();
        mat.metalnessMap?.dispose();
        mat.envMap?.dispose();
        mat.lightMap?.dispose();
        mat.aoMap?.dispose();
        mat.emissiveMap?.dispose();
      } else if (mat instanceof THREE.MeshBasicMaterial) {
        mat.map?.dispose();
        mat.envMap?.dispose();
        mat.lightMap?.dispose();
        mat.aoMap?.dispose();
      }
      mat.dispose();
    }
  });
}

export function disposeSceneEnvironment(scene: THREE.Scene): void {
  const env = scene.environment;
  if (env && "dispose" in env && typeof env.dispose === "function") {
    env.dispose();
  }
  scene.environment = null;
}

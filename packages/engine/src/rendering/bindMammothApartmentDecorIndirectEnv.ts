import * as THREE from "three";
import {
  bindMammothMetallicReadableEnv,
  mammothSpecularReadabilityWeight,
  MAMMOTH_METALLIC_ENV_READABLE_UD,
} from "./bindMammothMetallicReadableEnv.js";

/** Subtle PMREM fill so matte props shade like plaster shells, not flat emissive cards. */
const DECOR_INDIRECT_ENV_INTENSITY = 0.36;

/**
 * Applies low-intensity PMREM to non-metallic apartment decor/furniture PBR materials.
 * Call after {@link bindMammothMetallicReadableEnv} so metallic props keep their stronger env boost.
 */
export function bindMammothApartmentDecorIndirectEnv(
  root: THREE.Object3D,
  envTexture: THREE.Texture | null,
): void {
  if (!envTexture) return;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = ([] as THREE.Material[]).concat(
      mesh.material as THREE.Material | THREE.Material[],
    );
    for (const raw of list) {
      if (!(raw instanceof THREE.MeshStandardMaterial)) continue;
      if (
        raw.userData[MAMMOTH_METALLIC_ENV_READABLE_UD as keyof typeof raw.userData]
      ) {
        continue;
      }
      const w = mammothSpecularReadabilityWeight(raw.metalness, raw.roughness);
      raw.envMap = envTexture;
      raw.envMapIntensity = THREE.MathUtils.lerp(
        DECOR_INDIRECT_ENV_INTENSITY,
        0.55,
        w,
      );
      raw.needsUpdate = true;
    }
  });
}

/** Metallic highlights first, then matte indirect fill. */
export function bindMammothApartmentPropReadableEnv(
  root: THREE.Object3D,
  envTexture: THREE.Texture | null,
): void {
  bindMammothMetallicReadableEnv(root, envTexture);
  bindMammothApartmentDecorIndirectEnv(root, envTexture);
}

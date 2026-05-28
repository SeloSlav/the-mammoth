import * as THREE from "three";
import {
  bindMammothResidentialShellIndirectEnv,
  MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD,
} from "@the-mammoth/engine";

/**
 * Auth orbit: soft skylight fill on façade shutters. Avoid {@link bindMammothApartmentPropReadableEnv}
 * — its metallic boost (envMapIntensity ≈ 3) reads as blown-out chrome under the exterior sun rig.
 */
const AUTH_BACKDROP_SHUTTER_ENV_INTENSITY = 0.1;

/** Extra roughness on shutter steel so the exterior key light does not mirror-polish the slats. */
const AUTH_BACKDROP_SHUTTER_ROUGHNESS_BUMP = 0.14;

/**
 * Megablock auth/login uses `scene.environment = null` (see `fpSessionEnvironment`). Unit shells
 * and façade shutters need per-mesh PMREM; shutter bind stays much gentler than in-unit props.
 */
export function bindAuthBackdropFacadeReadableEnv(
  scene: THREE.Scene,
  buildingRoot: THREE.Object3D,
  shutterRoot?: THREE.Object3D | null,
): void {
  const metallic = scene.userData.mammothFpMetallicReadableEnv;
  const shellWarm = scene.userData[MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD];
  const metallicTex = metallic instanceof THREE.Texture ? metallic : null;
  const shellTex = shellWarm instanceof THREE.Texture ? shellWarm : metallicTex;

  bindMammothResidentialShellIndirectEnv(buildingRoot, shellTex);
  if (shutterRoot && metallicTex) {
    bindAuthBackdropShutterFacadeEnv(shutterRoot, metallicTex);
  }
}

export function bindAuthBackdropShutterFacadeEnv(
  shutterRoot: THREE.Object3D,
  envTexture: THREE.Texture,
): void {
  shutterRoot.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = ([] as THREE.Material[]).concat(
      mesh.material as THREE.Material | THREE.Material[],
    );
    for (let i = 0; i < list.length; i++) {
      const raw = list[i]!;
      if (!(raw instanceof THREE.MeshStandardMaterial)) continue;
      if (
        raw.envMap === envTexture &&
        Math.abs(raw.envMapIntensity - AUTH_BACKDROP_SHUTTER_ENV_INTENSITY) < 1e-5
      ) {
        continue;
      }
      const prepared = raw.clone();
      prepared.envMap = envTexture;
      prepared.envMapIntensity = AUTH_BACKDROP_SHUTTER_ENV_INTENSITY;
      if (prepared.metalness > 0.35) {
        prepared.roughness = Math.min(
          1,
          prepared.roughness + AUTH_BACKDROP_SHUTTER_ROUGHNESS_BUMP,
        );
      }
      prepared.needsUpdate = true;
      if (Array.isArray(mesh.material)) {
        (mesh.material as THREE.Material[])[i] = prepared;
      } else {
        mesh.material = prepared;
      }
    }
  });
}

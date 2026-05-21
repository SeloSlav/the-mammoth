import * as THREE from "three";

export const MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD = "mammothApartmentShellWarmEnv";

export type ApartmentInteriorWarmEnvMount = {
  texture: THREE.Texture;
  dispose: () => void;
};

/**
 * Amber dome PMREM for apartment shell plaster/parquet — avoids cool gray `RoomEnvironment`
 * reflections that fight the warm interior bounce rig.
 */
export function createApartmentInteriorWarmEnvMap(
  renderer: THREE.WebGPURenderer,
): ApartmentInteriorWarmEnvMount {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc4b098);

  const hemi = new THREE.HemisphereLight(0xffe8c8, 0xc9a882, 0.82);
  scene.add(hemi);
  const fill = new THREE.AmbientLight(0xd7b892, 0.38);
  scene.add(fill);
  const warmDir = new THREE.DirectionalLight(0xffddb0, 0.16);
  warmDir.position.set(-4, 8, -6);
  scene.add(warmDir);

  const target = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();

  return {
    texture: target.texture,
    dispose: () => {
      target.dispose();
    },
  };
}

export function apartmentInteriorShellWarmEnvFromScene(
  scene: THREE.Scene,
): THREE.Texture | null {
  const env = scene.userData[MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD];
  return env instanceof THREE.Texture ? env : null;
}

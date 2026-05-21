import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  createApartmentInteriorWarmEnvMap,
  MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD,
  type ApartmentInteriorWarmEnvMount,
} from "@the-mammoth/engine";

export type EditorPmremEnvironment = {
  pmrem: THREE.PMREMGenerator;
  applyEnvironment: (on: boolean) => void;
};

export function createEditorPmremEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGPURenderer,
): EditorPmremEnvironment {
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRt: THREE.RenderTarget | null = null;
  let shellWarmEnvMount: ApartmentInteriorWarmEnvMount | null = null;

  const applyEnvironment = (on: boolean) => {
    scene.environment = null;
    if (envRt) {
      envRt.dispose();
      envRt = null;
    }
    shellWarmEnvMount?.dispose();
    shellWarmEnvMount = null;
    delete scene.userData.mammothFpMetallicReadableEnv;
    delete scene.userData[MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD];
    if (on) {
      envRt = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRt.texture;
      scene.userData.mammothFpMetallicReadableEnv = envRt.texture;
      shellWarmEnvMount = createApartmentInteriorWarmEnvMap(renderer);
      scene.userData[MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD] = shellWarmEnvMount.texture;
    }
  };

  return { pmrem, applyEnvironment };
}

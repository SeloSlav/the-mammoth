import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

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

  const applyEnvironment = (on: boolean) => {
    scene.environment = null;
    if (envRt) {
      envRt.dispose();
      envRt = null;
    }
    if (on) {
      envRt = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRt.texture;
    }
  };

  return { pmrem, applyEnvironment };
}

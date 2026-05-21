import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type FpPlacementPreviewTarget = {
  worldPosition: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
  scale?: number;
  /** Balcony grow seed placement — per-crop tint for the procedural sapling ghost. */
  balconyGrowTint?: string;
};

export type FpWorldPlacementPreview = {
  setVisible: (visible: boolean) => void;
  update: (target: FpPlacementPreviewTarget | null, valid: boolean) => void;
  dispose: () => void;
};

const VALID_EMISSIVE = new THREE.Color(0x2ecc71);
const INVALID_EMISSIVE = new THREE.Color(0xe74c3c);

export async function createFpWorldPlacementPreview(
  scene: THREE.Scene,
  ghostUrl: string,
): Promise<FpWorldPlacementPreview> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(ghostUrl);
  const root = gltf.scene;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      mat.transparent = true;
      mat.opacity = 0.45;
      mat.depthWrite = false;
      mat.emissive = INVALID_EMISSIVE.clone();
      mat.emissiveIntensity = 0.35;
    }
  });
  root.visible = false;
  scene.add(root);

  return {
    setVisible(visible: boolean) {
      root.visible = visible;
    },
    update(target, valid) {
      if (!target) {
        root.visible = false;
        return;
      }
      root.visible = true;
      root.position.copy(target.worldPosition);
      root.quaternion.copy(target.worldQuaternion);
      const s = target.scale ?? 1;
      root.scale.setScalar(s);
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
          mat.emissive.copy(valid ? VALID_EMISSIVE : INVALID_EMISSIVE);
        }
      });
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose();
        }
      });
    },
  };
}

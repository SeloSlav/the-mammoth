import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { balconyGrowStageVisualScale } from "@the-mammoth/schemas";
import { bottomAlignGrowStageVisual } from "./fpBalconyGrowStageVisual.js";
import type { FpWorldPlacementPreview } from "../fpPlacement/fpWorldPlacementPreview.js";

const VALID_EMISSIVE = new THREE.Color(0x5dffb0);
const INVALID_EMISSIVE = new THREE.Color(0xff7070);

/** Seed ghost — bottom-aligned, scaled via anchor so tray soil does not deform. */
export async function createBalconyGrowSeedPreview(
  scene: THREE.Scene,
  ghostUrl: string,
): Promise<FpWorldPlacementPreview> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(ghostUrl);
  const anchor = new THREE.Group();
  anchor.name = "balcony_grow_seed_preview";
  const vis = gltf.scene;
  bottomAlignGrowStageVisual(vis, 1);
  vis.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.renderOrder = 820;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      mat.transparent = true;
      mat.opacity = 0.72;
      mat.depthWrite = false;
      mat.emissive = INVALID_EMISSIVE.clone();
      mat.emissiveIntensity = 0.55;
    }
  });
  anchor.add(vis);
  anchor.visible = false;
  scene.add(anchor);

  let lastValid: boolean | null = null;

  const applyValidTint = (valid: boolean): void => {
    vis.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        mat.emissive.copy(valid ? VALID_EMISSIVE : INVALID_EMISSIVE);
      }
    });
  };

  return {
    setVisible(visible: boolean) {
      anchor.visible = visible;
    },
    update(target, valid) {
      if (!target) {
        anchor.visible = false;
        lastValid = null;
        return;
      }
      anchor.visible = true;
      anchor.position.copy(target.worldPosition);
      anchor.quaternion.copy(target.worldQuaternion);
      anchor.scale.setScalar(target.scale ?? balconyGrowStageVisualScale("seed"));
      if (valid !== lastValid) {
        applyValidTint(valid);
        lastValid = valid;
      }
    },
    dispose() {
      scene.remove(anchor);
      vis.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose();
        }
      });
    },
  };
}

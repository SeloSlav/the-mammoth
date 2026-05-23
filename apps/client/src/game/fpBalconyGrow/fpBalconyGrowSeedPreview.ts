import * as THREE from "three";
import { deepDisposeObject3D } from "@the-mammoth/engine";
import { balconyGrowStageVisualScale } from "@the-mammoth/schemas";
import { mountBalconyGrowSeedVisual } from "./fpBalconyGrowStageVisual.js";
import type { FpWorldPlacementPreview } from "../fpPlacement/fpWorldPlacementPreview.js";

const VALID_EMISSIVE = new THREE.Color(0x5dffb0);
const INVALID_EMISSIVE = new THREE.Color(0xff7070);
const DEFAULT_SEED_TINT = "#3d8b4a";

function applyPlacementGhostMaterials(root: THREE.Object3D, valid: boolean): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.renderOrder = 820;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      mat.transparent = true;
      mat.opacity = 0.72;
      mat.depthWrite = false;
      mat.emissive.copy(valid ? VALID_EMISSIVE : INVALID_EMISSIVE);
      mat.emissiveIntensity = 0.55;
    }
  });
}

/** Seed-cluster placement ghost — matches day-0 tray slot visuals after plant. */
export function createBalconyGrowSeedPreview(scene: THREE.Scene): FpWorldPlacementPreview {
  const anchor = new THREE.Group();
  anchor.name = "balcony_grow_seed_preview";
  const holder = new THREE.Group();
  holder.name = "balcony_grow_seed_preview_holder";
  anchor.add(holder);
  anchor.visible = false;
  scene.add(anchor);

  let lastVisualKey = "";
  let lastValid: boolean | null = null;

  const rebuildVisual = (stageScale: number, tint: string): void => {
    while (holder.children.length > 0) {
      const child = holder.children[0]!;
      holder.remove(child);
      deepDisposeObject3D(child);
    }
    mountBalconyGrowSeedVisual(holder, stageScale, tint);
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
      const stageScale = target.scale ?? balconyGrowStageVisualScale("seed");
      const tint = target.balconyGrowTint ?? DEFAULT_SEED_TINT;
      const visualKey = `${stageScale.toFixed(4)}:${tint}`;
      if (visualKey !== lastVisualKey) {
        rebuildVisual(stageScale, tint);
        lastVisualKey = visualKey;
        lastValid = null;
      }

      anchor.visible = true;
      anchor.position.copy(target.worldPosition);
      anchor.quaternion.copy(target.worldQuaternion);
      anchor.scale.setScalar(target.decorUniformScale ?? 1);

      if (valid !== lastValid) {
        applyPlacementGhostMaterials(holder, valid);
        lastValid = valid;
      }
    },
    dispose() {
      scene.remove(anchor);
      while (holder.children.length > 0) {
        const child = holder.children[0]!;
        holder.remove(child);
        deepDisposeObject3D(child);
      }
    },
  };
}

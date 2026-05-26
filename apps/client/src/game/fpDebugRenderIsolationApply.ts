import * as THREE from "three";
import {
  MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD,
  MAMMOTH_FP_WORLD_NPC_UD,
} from "@the-mammoth/engine";
import {
  getFpDebugRenderIsolationFlags,
  isFpDebugRenderIsolationSuppressingAnything,
} from "./fpDebugRenderIsolation.js";

export type FpDebugRenderIsolationTargets = {
  buildingRoot: THREE.Group;
  scene: THREE.Scene;
  lobbyInteriorRoot: THREE.Group | null;
  transparentBuildingMeshes: readonly THREE.Mesh[];
  localViewmodelRoot: THREE.Object3D;
};

const DECOR_ROOT_NAME = "apartment_unit_decor_root";
const DROPPED_ITEMS_ROOT_NAME = "dropped_items";
const DECALS_GROUP_NAME = "Decals";

/**
 * Final pre-render pass: force-hide disabled categories only.
 * Never sets `.visible = true` — avoids undoing floor-plate / frustum culling.
 */
export function applyFpDebugRenderIsolationForceOff(targets: FpDebugRenderIsolationTargets): void {
  if (!isFpDebugRenderIsolationSuppressingAnything()) return;

  const flags = getFpDebugRenderIsolationFlags();

  if (!flags.apartmentDecor) {
    const decorRoot = targets.buildingRoot.getObjectByName(DECOR_ROOT_NAME);
    if (decorRoot?.visible) decorRoot.visible = false;
  }

  if (!flags.apartmentDecorFloorShadows || !flags.apartmentDecor) {
    targets.buildingRoot.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData[MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD] !== true) return;
      if (obj.visible) obj.visible = false;
    });
  }

  if (!flags.transparentMeshes) {
    for (let i = 0; i < targets.transparentBuildingMeshes.length; i++) {
      const mesh = targets.transparentBuildingMeshes[i]!;
      if (mesh.visible) mesh.visible = false;
    }
  }

  if (!flags.lobbyInterior && targets.lobbyInteriorRoot?.visible) {
    targets.lobbyInteriorRoot.visible = false;
  }

  if (!flags.droppedItems) {
    const droppedRoot = targets.scene.getObjectByName(DROPPED_ITEMS_ROOT_NAME);
    if (droppedRoot?.visible) droppedRoot.visible = false;
  }

  if (!flags.decals) {
    const decalsRoot = targets.scene.getObjectByName(DECALS_GROUP_NAME);
    if (decalsRoot?.visible) decalsRoot.visible = false;
  }

  if (!flags.npcs) {
    targets.scene.traverse((obj) => {
      if (obj.userData[MAMMOTH_FP_WORLD_NPC_UD] !== true) return;
      if (obj.visible) obj.visible = false;
    });
  }

  if (!flags.localViewmodel && targets.localViewmodelRoot.visible) {
    targets.localViewmodelRoot.visible = false;
  }
}

import * as THREE from "three";
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

  if (!flags.apartmentFurniture) {
    for (let i = 0; i < targets.buildingRoot.children.length; i++) {
      const ch = targets.buildingRoot.children[i]!;
      if (ch.name.startsWith("apartment_furniture_plate_") && ch.visible) {
        ch.visible = false;
      }
    }
  }

  if (!flags.exteriorTrees) {
    for (let i = 0; i < targets.buildingRoot.children.length; i++) {
      const ch = targets.buildingRoot.children[i]!;
      if (ch.userData.mammothExteriorProceduralTrees === true && ch.visible) {
        ch.visible = false;
      }
    }
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

  if (!flags.localViewmodel && targets.localViewmodelRoot.visible) {
    targets.localViewmodelRoot.visible = false;
  }
}

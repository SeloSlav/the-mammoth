import * as THREE from "three";
import { getFpDebugRenderIsolationFlags } from "./fpDebugRenderIsolation.js";

export type FpDebugRenderIsolationTargets = {
  buildingRoot: THREE.Group;
  scene: THREE.Scene;
  lobbyInteriorRoot: THREE.Group | null;
  floorPlateGroups: readonly THREE.Group[];
  unitInteriorMeshes: readonly THREE.Mesh[];
  transparentBuildingMeshes: readonly THREE.Mesh[];
  localViewmodelRoot: THREE.Object3D;
};

const DECOR_ROOT_NAME = "apartment_unit_decor_root";
const DROPPED_ITEMS_ROOT_NAME = "dropped_items";
const DECALS_GROUP_NAME = "Decals";
const EXTERIOR_TREE_GROVE_NAME = "exterior_procedural_tree_grove";

/** Applies M-menu render isolation after normal visibility sync (forces OFF categories hidden). */
export function applyFpDebugRenderIsolation(targets: FpDebugRenderIsolationTargets): void {
  const flags = getFpDebugRenderIsolationFlags();

  const decorRoot = targets.buildingRoot.getObjectByName(DECOR_ROOT_NAME);
  if (decorRoot) decorRoot.visible = flags.apartmentDecor;

  for (let i = 0; i < targets.buildingRoot.children.length; i++) {
    const ch = targets.buildingRoot.children[i]!;
    if (ch.name.startsWith("apartment_furniture_plate_")) {
      ch.visible = flags.apartmentFurniture;
    }
  }

  for (let i = 0; i < targets.floorPlateGroups.length; i++) {
    targets.floorPlateGroups[i]!.visible = flags.floorPlates;
  }

  for (let i = 0; i < targets.unitInteriorMeshes.length; i++) {
    targets.unitInteriorMeshes[i]!.visible = flags.unitInteriorShells;
  }

  for (let i = 0; i < targets.transparentBuildingMeshes.length; i++) {
    targets.transparentBuildingMeshes[i]!.visible = flags.transparentMeshes;
  }

  const treeGrove = targets.buildingRoot.getObjectByName(EXTERIOR_TREE_GROVE_NAME);
  if (treeGrove) treeGrove.visible = flags.exteriorTrees;

  if (targets.lobbyInteriorRoot) {
    targets.lobbyInteriorRoot.visible = flags.lobbyInterior;
  }

  const droppedRoot = targets.scene.getObjectByName(DROPPED_ITEMS_ROOT_NAME);
  if (droppedRoot) droppedRoot.visible = flags.droppedItems;

  const decalsRoot = targets.scene.getObjectByName(DECALS_GROUP_NAME);
  if (decalsRoot) decalsRoot.visible = flags.decals;

  targets.localViewmodelRoot.visible = flags.localViewmodel;
}

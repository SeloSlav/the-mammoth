import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LANDING_DOOR_OPENING_PROXY_ID } from "@the-mammoth/world";
import { useEditorStore } from "../../state/editorStore.js";
import { objectLivesUnderScene } from "../scene/sceneGraphUtils.js";
import { editorAncestorPlateLevelIndex } from "./editorAncestorLevelIndex.js";
import {
  floorPlacedObjectIdForTransformRoot,
  interiorEntityIdForTransformRoot,
  resolveCabPartId,
  resolveFloorPlacementTransformRoot,
  resolveGizmoFloorDocId,
  resolveInteriorPlacementTransformRoot,
  resolveLandingKitPickId,
  resolveStairWellPartId,
} from "../placement/editorPlacementKeys.js";

export type EditorSceneSelectionFraming = {
  frameBox(box: THREE.Box3): void;
  frameObject(obj: THREE.Object3D | null): void;
  frameFocusedStoryObject(): void;
  findBestSelectionTarget(): THREE.Object3D | null;
};

export function createEditorSceneSelectionFraming(deps: {
  camera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  getBuildingRoot: () => THREE.Object3D | null;
  scene: THREE.Scene;
  getPreferredPreviewSelectionTarget: () => THREE.Object3D | null;
  setPreferredPreviewSelectionTarget: (v: THREE.Object3D | null) => void;
  landingKitPickOptions: () => { solidLeafAsWhole?: boolean } | undefined;
}): EditorSceneSelectionFraming {
  const {
    camera,
    orbitControls,
    getBuildingRoot,
    scene,
    getPreferredPreviewSelectionTarget,
    setPreferredPreviewSelectionTarget,
    landingKitPickOptions,
  } = deps;

  function frameBox(box: THREE.Box3): void {
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    camera.up.set(0, 1, 0);
    orbitControls.target.copy(center);
    camera.position
      .copy(center)
      .add(
        new THREE.Vector3(-0.82, 0.46, 0.68)
          .normalize()
          .multiplyScalar(Math.max(span * 1.5, 16)),
      );
    camera.lookAt(center);
    orbitControls.update();
  }

  function frameObject(obj: THREE.Object3D | null): void {
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    frameBox(box);
  }

  function frameFocusedStoryObject(): void {
    const buildingRoot = getBuildingRoot();
    if (!buildingRoot) return;
    const focusedLevel = useEditorStore.getState().focusedStoryLevelIndex;
    const levelNodes: THREE.Object3D[] = [];
    buildingRoot.traverse((child) => {
      if (child.userData.mammothPlateLevelIndex === focusedLevel)
        levelNodes.push(child);
    });
    const box = new THREE.Box3();
    for (const node of levelNodes) {
      box.expandByObject(node);
    }
    if (box.isEmpty()) {
      frameObject(buildingRoot);
      return;
    }
    frameBox(box);
  }

  function findBestSelectionTarget(): THREE.Object3D | null {
    const s = useEditorStore.getState();
    const buildingRoot = getBuildingRoot();
    if (!buildingRoot || !s.selectedId) return null;
    const preferredPreviewSelectionTarget = getPreferredPreviewSelectionTarget();
    if (
      preferredPreviewSelectionTarget &&
      objectLivesUnderScene(preferredPreviewSelectionTarget, scene)
    ) {
      const preferredId =
        s.mode === "cab"
          ? resolveCabPartId(preferredPreviewSelectionTarget)
          : s.mode === "landing_preview"
            ? resolveLandingKitPickId(
                preferredPreviewSelectionTarget,
                landingKitPickOptions(),
              )
            : s.mode === "stairwell_preview"
              ? resolveStairWellPartId(preferredPreviewSelectionTarget)
              : null;
      if (preferredId === s.selectedId) return preferredPreviewSelectionTarget;
    }
    setPreferredPreviewSelectionTarget(null);
    let target: THREE.Object3D | null = null;
    let bestRank = -1;
    let bestD = Infinity;
    if (s.mode === "cab") {
      buildingRoot.traverse((o) => {
        const pid = o.userData.editorCabPartId as string | undefined;
        if (pid !== s.selectedId) return;
        target = o;
      });
      return target;
    }
    if (s.mode === "landing_preview") {
      if (s.selectedId === "landing_door_kit") {
        const door = buildingRoot.getObjectByName("editor_landing_door");
        return door ?? null;
      }
      if (s.selectedId === LANDING_DOOR_OPENING_PROXY_ID) {
        buildingRoot.traverse((o) => {
          if (o.userData.editorLandingOpeningProxy === true) target = o;
        });
        return target;
      }
      buildingRoot.traverse((o) => {
        const pid = o.userData.editorLandingPartId as string | undefined;
        if (pid === s.selectedId) target = o;
      });
      return target;
    }
    if (s.mode === "stairwell_preview") {
      buildingRoot.traverse((o) => {
        const pid = o.userData.editorStairPartId as string | undefined;
        if (pid === s.selectedId && target === null) target = o;
      });
      return target;
    }
    if (s.mode === "floor") {
      buildingRoot.traverse((o) => {
        const root = resolveFloorPlacementTransformRoot(o, s.floorDocs);
        if (root !== o) return;
        const id = floorPlacedObjectIdForTransformRoot(o, s.floorDocs);
        if (id !== s.selectedId) return;
        if (
          resolveGizmoFloorDocId(o, s.activeFloorDocId) !== s.activeFloorDocId
        )
          return;
        const levelIndex = editorAncestorPlateLevelIndex(o);
        const rank = levelIndex === s.focusedStoryLevelIndex ? 2 : 1;
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        const d = wp.distanceToSquared(camera.position);
        if (rank > bestRank || (rank === bestRank && d < bestD)) {
          bestRank = rank;
          bestD = d;
          target = o;
        }
      });
      return target;
    }
    if (s.mode === "interior") {
      const intDoc = s.interiorDocs[s.activeInteriorDocId];
      buildingRoot.traverse((o) => {
        const root = resolveInteriorPlacementTransformRoot(o, intDoc);
        if (root !== o) return;
        const eid = interiorEntityIdForTransformRoot(o);
        if (eid !== s.selectedId) return;
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        const d = wp.distanceToSquared(camera.position);
        if (d < bestD) {
          bestD = d;
          target = o;
        }
      });
      return target;
    }
    buildingRoot.traverse((o) => {
      const id =
        (typeof o.userData.placedObjectId === "string" &&
          o.userData.placedObjectId) ||
        o.name;
      if (id !== s.selectedId) return;
      const levelIndex = editorAncestorPlateLevelIndex(o);
      const rank = levelIndex === s.focusedStoryLevelIndex ? 1 : 0;
      const wp = new THREE.Vector3();
      o.getWorldPosition(wp);
      const d = wp.distanceToSquared(camera.position);
      if (rank > bestRank || (rank === bestRank && d < bestD)) {
        bestRank = rank;
        bestD = d;
        target = o;
      }
    });
    return target;
  }

  return {
    frameBox,
    frameObject,
    frameFocusedStoryObject,
    findBestSelectionTarget,
  };
}

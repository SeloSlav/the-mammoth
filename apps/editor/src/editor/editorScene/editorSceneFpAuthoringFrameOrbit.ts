import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useEditorStore } from "../../state/editorStore.js";
import type { FpConsumableEditorSession } from "../fpAuthoring/fpConsumableEditorSession.js";
import type { FpViewmodelEditorSession } from "../fpAuthoring/fpViewmodelEditorSession.js";
import {
  isConsumableFpAuthoringState,
  isWeaponFpAuthoringState,
} from "./editorStoreModeGuards.js";

export function createFrameOrbitOnActiveFpSession(deps: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  getFpSession: () => FpViewmodelEditorSession | null;
  getFpConsumableSession: () => FpConsumableEditorSession | null;
}): () => void {
  const {
    scene,
    camera,
    orbitControls,
    getFpSession,
    getFpConsumableSession,
  } = deps;

  return function frameOrbitOnActiveFpSession(): void {
    scene.updateMatrixWorld(true);
    const t = new THREE.Vector3();
    const st = useEditorStore.getState();
    let hit = false;
    if (isWeaponFpAuthoringState(st)) {
      hit =
        getFpSession()?.getPresenter()?.getAuthoringOrbitTargetWorld(t) ?? false;
    } else if (isConsumableFpAuthoringState(st)) {
      hit = getFpConsumableSession()?.getAuthoringOrbitTarget(t) ?? false;
    }
    if (!hit) return;
    orbitControls.target.copy(t);
    const dir = new THREE.Vector3(0.58, 0.22, 0.78).normalize();
    const dist = Math.min(1.05, orbitControls.maxDistance * 0.35);
    camera.position.copy(t).addScaledVector(dir, dist);
    orbitControls.update();
  };
}

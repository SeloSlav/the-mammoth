import type { PerspectiveCamera } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  EDITOR_ORBIT_MIN_DISTANCE_M,
  EDITOR_ORBIT_SPEED_DISTANCE_REBIND_RATIO,
  editorOrbitDistanceInvariantSpeeds,
} from "./editorOrbitSpeeds.js";

/** Rebind orbit speeds only when camera–target distance shifts enough to matter. */
export function createEditorOrbitDistanceSpeedBinder(deps: {
  camera: PerspectiveCamera;
  orbitControls: OrbitControls;
}): () => void {
  const { camera, orbitControls } = deps;
  let lastDistanceM = -1;

  return (): void => {
    const distanceM = Math.max(
      EDITOR_ORBIT_MIN_DISTANCE_M,
      camera.position.distanceTo(orbitControls.target),
    );
    if (lastDistanceM >= 0) {
      const deltaRatio = Math.abs(distanceM - lastDistanceM) / lastDistanceM;
      if (deltaRatio < EDITOR_ORBIT_SPEED_DISTANCE_REBIND_RATIO) return;
    }
    lastDistanceM = distanceM;

    const speeds = editorOrbitDistanceInvariantSpeeds({
      distanceM,
      minDistanceM: EDITOR_ORBIT_MIN_DISTANCE_M,
    });
    orbitControls.zoomSpeed = speeds.zoomSpeed;
    orbitControls.rotateSpeed = speeds.rotateSpeed;
    orbitControls.panSpeed = speeds.panSpeed;
  };
}

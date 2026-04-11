import * as THREE from "three";

/** Minimal first-person rig: camera + yaw/pitch grouping. */
export function createFPCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(75, 1, 0.05, 500);
  cam.rotation.order = "YXZ";
  return cam;
}

import * as THREE from "three";

export {
  createFpLocomotionState,
  fpLocomotionConstants,
  queueFpJump,
  stepFpLocomotion,
  type FpLocomotionInput,
  type FpLocomotionState,
} from "./fpLocomotion.js";

/** @deprecated Prefer {@link createFPRig} — keeps camera parented to the body. */
export function createFPCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(75, 1, 0.05, 500);
  cam.rotation.order = "YXZ";
  return cam;
}

/**
 * First-person rig (same idea as cyberpunk-apartment `PlayerController`):
 * world `rig` (position + yaw), `headPivot` at eye height (pitch), `camera` child.
 */
export function createFPRig(eyeHeight = 1.55): {
  rig: THREE.Group;
  headPivot: THREE.Group;
  camera: THREE.PerspectiveCamera;
} {
  const rig = new THREE.Group();
  const headPivot = new THREE.Group();
  headPivot.position.y = eyeHeight;
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 500);
  camera.rotation.order = "YXZ";
  headPivot.add(camera);
  rig.add(headPivot);
  return { rig, headPivot, camera };
}

import * as THREE from "three";
import { fpLocomotionConstants } from "./fpLocomotion.js";

export {
  createFpLocomotionState,
  fpLocomotionConstants,
  queueFpJump,
  stepFpLocomotion,
  type FpLocomotionInput,
  type FpLocomotionState,
  type FpLocomotionWalkOptions,
  type WalkGroundSampler,
} from "./fpLocomotion.js";

/** @deprecated Prefer {@link createFPRig} — keeps camera parented to the body. */
export function createFPCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(
    fpLocomotionConstants.cameraFovDeg,
    1,
    0.05,
    900,
  );
  cam.rotation.order = "YXZ";
  return cam;
}

/**
 * First-person rig:
 * - `headPitch`: mouse look **up/down** (applies to viewmodel limbs/feet parented here too).
 * - `headFreeLook`: Alt **yaw only on the camera** so arms/feet stay body-forward and do not
 *   vanish when peeking sideways (viewmodel must not be parented under `headFreeLook`).
 */
export function createFPRig(eyeHeight = 1.55): {
  rig: THREE.Group;
  headPivot: THREE.Group;
  headPitch: THREE.Group;
  headFreeLook: THREE.Group;
  camera: THREE.PerspectiveCamera;
} {
  const rig = new THREE.Group();
  const headPivot = new THREE.Group();
  headPivot.name = "fp_head_pivot";
  headPivot.position.y = eyeHeight;
  const headPitch = new THREE.Group();
  headPitch.name = "fp_head_pitch";
  const headFreeLook = new THREE.Group();
  headFreeLook.name = "fp_head_free_look";
  const camera = new THREE.PerspectiveCamera(
    fpLocomotionConstants.cameraFovDeg,
    1,
    0.05,
    900,
  );
  camera.rotation.order = "YXZ";
  headPivot.add(headPitch);
  headPitch.add(headFreeLook);
  headFreeLook.add(camera);
  rig.add(headPivot);
  return { rig, headPivot, headPitch, headFreeLook, camera };
}

export type {
  AnimationDriverDesiredState,
  IAnimationDriver,
} from "./animation/animationDriverTypes.js";
export { PrimitiveAnimationDriver, GltfAnimationDriver } from "./animation/index.js";

export type {
  WeaponAnimationSet,
  WeaponDefinition,
  WeaponPresentationRole,
} from "./weapons/weaponTypes.js";
export {
  crowbarWeaponDefinition,
  knifeWeaponDefinition,
  pistolWeaponDefinition,
} from "./weapons/sampleDefinitions.js";
export { WeaponPresenter, type WeaponPresenterConfig } from "./weapons/WeaponPresenter.js";
export {
  parseWeaponPrimitivePresentationDoc,
  primitiveMeleeSwingTrackT,
  samplePrimitiveMeleeSwing,
  type PrimitiveRolePresentation,
  type PrimitiveSwingKeyframe,
  type WeaponAuthorVec3,
  type WeaponPrimitivePresentationDoc,
} from "./weapons/index.js";

export {
  PlayerPresentationManager,
  LocalFirstPersonPresenter,
  RemotePlayerPresenter,
  buildPrimitiveHumanoid,
  type PlayerPresentationManagerOptions,
  type LocalFirstPersonPresenterOptions,
  type PrimitiveHumanoidParts,
  type MeleeCombatVisualEvent,
  type MeleeCombatVisualSink,
  type HitTracePlaceholder,
} from "./playerPresentation/index.js";

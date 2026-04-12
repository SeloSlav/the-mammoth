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
 * - `headPitch`: mouse **pitch only** for the viewmodel (sibling of free-look); no Alt yaw.
 * - `headFreeLook` → `headCameraPitch` → `camera`: Alt **yaw before pitch** so horizontal look
 *   stays around **world up** (horizon stays level when looking up/down). If yaw were under pitch,
 *   mouse X would bank the view. Viewmodel must not be under `headFreeLook`.
 */
export function createFPRig(eyeHeight = 1.55): {
  rig: THREE.Group;
  headPivot: THREE.Group;
  headPitch: THREE.Group;
  headCameraPitch: THREE.Group;
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
  const headCameraPitch = new THREE.Group();
  headCameraPitch.name = "fp_head_camera_pitch";
  const camera = new THREE.PerspectiveCamera(
    fpLocomotionConstants.cameraFovDeg,
    1,
    0.05,
    900,
  );
  camera.rotation.order = "YXZ";
  headPivot.add(headFreeLook);
  headFreeLook.add(headCameraPitch);
  headCameraPitch.add(camera);
  headPivot.add(headPitch);
  rig.add(headPivot);
  return { rig, headPivot, headPitch, headCameraPitch, headFreeLook, camera };
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

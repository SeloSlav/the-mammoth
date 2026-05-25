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
 * - `headPitch`: **viewmodel** pitch (sibling of free-look); no Alt yaw. Gameplay may zero this
 *   while Alt free-look is held so vertical look moves only the camera (`headCameraPitch`), not the gun.
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
  baseballBatWeaponDefinition,
  crowbarWeaponDefinition,
  knifeWeaponDefinition,
  srbosjekWeaponDefinition,
} from "./weapons/sampleDefinitions.js";
export {
  ALL_WEAPON_DEFINITIONS,
  WEAPON_DEFINITION_ID_SET,
  applyWeaponPrimitivePresentationDoc,
  equippedHeldItemIdFromDefId,
  getWeaponDefinition,
  getWeaponDefinitionForEquippedPrimary,
} from "./weapons/weaponRegistry.js";
export { WeaponPresenter, type WeaponPresenterConfig } from "./weapons/WeaponPresenter.js";
export {
  cloneDefaultFpMeleeSwingKeyframes,
  DEFAULT_FP_MELEE_SWING_KEYFRAMES,
  FP_GRIP_ANCHOR_MAX_ABS_M,
  FP_RIG_ROOT_MAX_ABS_M,
  FP_RIG_ROOT_XZ_MAX_ABS_M,
  FP_RIG_ROOT_Y_MAX_M,
  FP_RIG_ROOT_Y_MIN_M,
  clampFpRigRootPositionInPlace,
  isFpRigRootPositionAuthorable,
  parseWeaponPrimitivePresentationDoc,
  primitiveMeleeSwingTrackT,
  samplePrimitiveMeleeSwing,
  type FpViewmodelAuthoringDoc,
  type PrimitiveRolePresentation,
  type PrimitiveSwingKeyframe,
  type WeaponAuthorVec3,
  type WeaponPrimitivePresentationDoc,
} from "./weapons/index.js";

export {
  PlayerPresentationManager,
  FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED,
  LocalFirstPersonPresenter,
  LocalMirrorPlayerPresenter,
  RemoteHeldWeaponPresentation,
  RemotePlayerPresenter,
  WorldPlayerBodyPresenter,
  REMOTE_PLAYER_BODY_URI_FEMALE,
  REMOTE_PLAYER_BODY_URI_MALE,
  REMOTE_PLAYER_CROWD_FULL_DETAIL_NEAREST,
  buildPrimitiveHumanoid,
  resolveSkinnedHumanoidHandBone,
  SKINNED_HUMANOID_RIGHT_HAND_BONE_NAMES,
  buildWeaponFirstPersonPresentationMergeFromPickList,
  FP_MELEE_HAND_RIGHT,
  type PlayerPresentationManagerOptions,
  type LocalFirstPersonPresenterOptions,
  type FpAuthoringPick,
  type PrimitiveHumanoidParts,
  type MeleeCombatVisualEvent,
  type MeleeCombatVisualSink,
  type HitTracePlaceholder,
  type WeaponFirstPersonAuthoringPresentationMerge,
  type WeaponMountAuthorMerge,
  type WeaponFirstPersonPersistRefs,
  FP_FIREARM_HITSCAN_RANGE_PISTOL_M,
  FP_FIREARM_HITSCAN_RANGE_SHOTGUN_M,
  FP_FIREARM_HITSCAN_SHOTGUN_PELLET_COUNT,
  FP_FIREARM_HITSCAN_SHOTGUN_SPREAD_RAD,
  fpFirearmHitscanPelletCountForHeldItem,
  fpFirearmHitscanRangeMForHeldItem,
  fpFirearmShotVisualConfigForHeldItem,
  sampleFpFirearmShotVisual,
  type FpFirearmShotVisualConfig,
  type FpFirearmShotVisualSample,
} from "./playerPresentation/index.js";
export {
  BabushkaNpcPresenter,
  WorldNpcPresenterPool,
  preloadBabushkaNpcBody,
  BABUSHKA_NPC_GLB_URI,
  BABUSHKA_NPC_DEATH_CLIP_SEC,
  MAMMOTH_FP_WORLD_NPC_UD,
} from "./npc/BabushkaNpcPresenter.js";
export {
  NpcHitDebugOverlay,
  BABUSHKA_HIT_BODY_RADIUS_M,
  BABUSHKA_HIT_BODY_HEIGHT_M,
  BABUSHKA_HIT_HEAD_BOX_M,
  BABUSHKA_HIT_HEAD_LIFT_ABOVE_BODY_M,
  BABUSHKA_HIT_HEAD_BOX_CROWN_INSET_M,
  BABUSHKA_HIT_BODY_GAP_M,
  babushkaHeadHitBoxTopY,
  babushkaHeadHitBoxCenterY,
  babushkaBodyHitTorsoHeightM,
} from "./npc/NpcHitDebugOverlay.js";
export {
  createNpcVisualSmoothingState,
  ingestNpcAuthoritativeTransform,
  stepNpcVisualSmoothing,
  NPC_VISUAL_SMOOTHING_DEFAULTS,
  type NpcVisualAnimationState,
  type NpcVisualSmoothingState,
} from "./npc/NpcVisualSmoothingState.js";
export { createGltfModelLoadRegistry, GltfModelLoadRegistry } from "./loaders/GltfModelLoadRegistry.js";
export {
  clearStaticModelFetchUrlCache,
  resolveStaticModelFetchUrl,
} from "./loaders/staticModelFetchUrl.js";
export { loadGltfSceneFirstMatch } from "./loaders/gltfLoadFirstMatch.js";
export {
  mammothCatalogGlbCandidates,
  MAMMOTH_CATALOG_GLB_FALLBACK_URI,
  MAMMOTH_CATALOG_GLB_PRIMARY_URI,
  MAMMOTH_CATALOG_GLB_SEARCH_ROOTS,
  MAMMOTH_STATIC_MODEL_BASE,
} from "@the-mammoth/assets";
export { deepDisposeObject3D, detachRegistryCloneSubtree, detachSkinnedModelCloneSubtree } from "./loaders/deepDisposeObject3D.js";
export {
  assertWebGpuAdapterOrThrow,
  requestWebGpuAdapter,
  webGpuAdapterSupportsTimestampQuery,
  assertWebGpuRendererBackend,
} from "./webGpuGate.js";
export {
  bindMammothMetallicReadableEnv,
  mammothSpecularReadabilityWeight,
  MAMMOTH_METALLIC_ENV_READABLE_UD,
  type MammothMetallicReadableEnvMeta,
} from "./rendering/bindMammothMetallicReadableEnv.js";
export {
  bindMammothApartmentDecorIndirectEnv,
  bindMammothApartmentPropReadableEnv,
  bindMammothResidentialShellIndirectEnv,
  apartmentInteriorShellMoodSlot,
  isApartmentInteriorShellMesh,
  MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD,
} from "./rendering/bindMammothApartmentDecorIndirectEnv.js";
export {
  applyMammothApartmentInteriorLightLayers,
  MAMMOTH_APARTMENT_DECOR_PROP_LAYER,
  MAMMOTH_APARTMENT_INTERIOR_FILL_LIGHT_LAYER_MASK,
  MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK,
  MAMMOTH_FP_VIEWMODEL_RENDER_LAYER,
  MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER,
  syncMammothApartmentInteriorViewLayers,
  tagApartmentDecorPropMeshesForInteriorLighting,
  tagMergedResidentialShellMeshes,
  tagMeshResidentialUnitInterior,
  tagResidentialUnitInteriorMeshesUnder,
  tagResidentialUnitInteriorShellMeshesUnder,
  isResidentialUnitInteriorRenderLayerMesh,
} from "./rendering/apartmentInteriorLayers.js";
export {
  APARTMENT_INTERIOR_PREVIEW_BACKGROUND,
  applyMammothApartmentInteriorLightLayersToGlobalRig,
  applyMammothApartmentInteriorScene,
  captureMammothApartmentInteriorSceneAtmosphere,
  mountMammothApartmentInteriorBounceRig,
  mountMammothApartmentInteriorSceneRig,
  syncMammothApartmentInteriorMetallicEnv,
  syncMammothApartmentInteriorSceneAtmosphere,
  syncMammothApartmentInteriorSceneLighting,
} from "./rendering/apartmentInteriorSceneLighting.js";
export {
  applyMammothApartmentInteriorEditorLayoutPresentation,
  applyMammothApartmentInteriorPresentation,
  bindMammothApartmentInteriorViewmodelEnv,
  frameMammothApartmentInteriorGameplayPreview,
  prepareMammothApartmentInteriorContentRoots,
  tagMammothApartmentInteriorShellRoot,
} from "./rendering/apartmentInteriorPresentation.js";
export {
  captureApartmentInteriorPreviewSceneAtmosphere,
  mountApartmentInteriorPreviewSceneLighting,
  syncApartmentInteriorPreviewSceneAtmosphere,
} from "./rendering/apartmentInteriorPreviewSceneLighting.js";
export { upgradeApartmentDecorMaterialToStandard } from "./rendering/apartmentDecorMaterialUpgrade.js";
export {
  applyCeilingFixtureLensGlow,
  applyGrowOpFixturePanelGlow,
  MAMMOTH_CEILING_LENS_GLOW_MESH_UD,
} from "./rendering/apartmentCeilingFixtureLensGlow.js";
export {
  attachApartmentWarmFixtureBulbGlow,
  moodGradeMammothApartmentDecorMaterial,
  moodGradeMammothApartmentDecorMesh,
  moodGradeMammothApartmentShellMaterial,
  moodGradeMammothApartmentShellMesh,
  moodGradeMammothApartmentShellRoot,
  MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_UD,
  MAMMOTH_APARTMENT_DECOR_SKIP_MOOD_GRADE_UD,
  MAMMOTH_APARTMENT_SHELL_MOOD_GRADED_UD,
} from "./rendering/apartmentDecorMoodGrade.js";
export {
  applyMammothStairwellCeilingFixtureVisual,
  collectMammothStairwellCeilingDecorGroups,
  ensureMammothStairwellCeilingFixtureVisuals,
  MAMMOTH_STAIRWELL_CEILING_VISUAL_APPLIED_UD,
  syncMammothStairwellCeilingFixturePresentation,
  syncMammothStairwellCeilingPracticalLights,
} from "./rendering/stairwellCeilingFixturePresentation.js";
export {
  createApartmentInteriorWarmEnvMap,
  apartmentInteriorShellWarmEnvFromScene,
  MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD,
  type ApartmentInteriorWarmEnvMount,
} from "./rendering/apartmentInteriorWarmEnv.js";
export {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  mammothApartmentInteriorBlend01,
  apartmentDecorContactShadowEligible,
  apartmentDecorEmitterKindFromModelPath,
  apartmentDecorUsesBakedEmissiveFixture,
  apartmentDecorUsesRuntimePracticalLight,
  apartmentDecorWarmLightFixtureKind,
  type ApartmentDecorEmitterKind,
  type ApartmentUnitWorldBounds,
} from "./rendering/apartmentInteriorVisualProfile.js";
export type { ApartmentInteriorPreviewSceneLightingMount } from "./rendering/apartmentInteriorPreviewSceneLighting.js";
export {
  apartmentPracticalLightSpecFromDecor,
  apartmentPracticalLightSpecFromDecorGroup,
  apartmentPracticalLightSpecFromWindowGlassMesh,
  collectApartmentInteriorPracticalLightSpecs,
  collectApartmentWindowLightSpecsFromRoot,
  mountApartmentPracticalLights,
  syncApartmentInteriorPracticalLighting,
  type ApartmentPracticalLightKind,
  type ApartmentPracticalLightSpec,
  type ApartmentPracticalLightsMount,
} from "./rendering/apartmentInteriorPracticalLights.js";
export {
  bakeApartmentShellMeshLightmap,
  bakeApartmentUnitShellLighting,
  applyApartmentShellBakedLightmap,
  clearApartmentShellBakedLightmap,
  clearApartmentUnitShellBakedLighting,
  MAMMOTH_APARTMENT_SHELL_BAKED_LIGHTMAP_UD,
  type ApartmentShellBakedLightingMount,
} from "./rendering/apartmentShellBakedLighting.js";
export {
  getApartmentShellBakedLightingBounceScale,
  setApartmentShellBakedLightingBounceScale,
} from "./rendering/apartmentShellBakedLightingState.js";
export {
  apartmentShellLightingLayoutHashInput,
  hashApartmentShellLightingLayout,
  type ApartmentShellLightingLayoutItem,
} from "./rendering/apartmentShellLightingLayoutHash.js";
export {
  collectApartmentShellBakeLightSpecs,
  evaluateApartmentShellLightingAtPoint,
} from "./rendering/apartmentShellLightingEvaluate.js";
export {
  attachApartmentDecorContactShadow,
  computeApartmentDecorContactShadowRadius,
  disposeLeakedApartmentDecorContactShadows,
  syncApartmentDecorBatchedContactShadows,
  type ApartmentDecorBatchedContactShadowMount,
} from "./rendering/apartmentInteriorContactShadow.js";
export {
  applyApartmentDecorCastShadowFlags,
  applyApartmentInteriorFloorReceiveShadowUnder,
  ensureMammothApartmentDecorShadowRenderer,
  isApartmentInteriorFloorShellMesh,
  requestMammothRendererShadowMapUpdate,
  syncApartmentDecorShadowRig,
  type ApartmentDecorShadowRigMount,
} from "./rendering/apartmentInteriorDecorShadow.js";
export {
  APARTMENT_BAKED_FLOOR_SHADOW_MESH_NAME,
  isApartmentBakedFloorShadowMesh,
  MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD,
  syncApartmentDecorBakedFloorShadowOverlay,
  type ApartmentDecorBakedFloorShadowMount,
} from "./rendering/apartmentInteriorBakedDecorFloorShadow.js";

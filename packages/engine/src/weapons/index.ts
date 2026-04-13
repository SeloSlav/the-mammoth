export type {
  WeaponAnimationSet,
  WeaponDefinition,
  WeaponPresentationRole,
} from "./weaponTypes.js";
export type {
  FpViewmodelAuthoringDoc,
  PrimitiveRolePresentation,
  PrimitiveSwingKeyframe,
  WeaponAuthorVec3,
  WeaponPrimitivePresentationDoc,
} from "./weaponPrimitiveAuthoring.js";
export {
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
} from "./weaponPrimitiveAuthoring.js";
export {
  baseballBatWeaponDefinition,
  crowbarWeaponDefinition,
  knifeWeaponDefinition,
  srbosjekWeaponDefinition,
} from "./sampleDefinitions.js";
export {
  ALL_WEAPON_DEFINITIONS,
  WEAPON_DEFINITION_ID_SET,
  applyWeaponPrimitivePresentationDoc,
  equippedHeldItemIdFromDefId,
  getWeaponDefinition,
  getWeaponDefinitionForEquippedPrimary,
} from "./weaponRegistry.js";
export { WeaponPresenter, type WeaponPresenterConfig } from "./WeaponPresenter.js";

export type {
  WeaponAnimationSet,
  WeaponDefinition,
  WeaponPresentationRole,
} from "./weaponTypes.js";
export type {
  PrimitiveRolePresentation,
  PrimitiveSwingKeyframe,
  WeaponAuthorVec3,
  WeaponPrimitivePresentationDoc,
} from "./weaponPrimitiveAuthoring.js";
export {
  parseWeaponPrimitivePresentationDoc,
  primitiveMeleeSwingTrackT,
  samplePrimitiveMeleeSwing,
} from "./weaponPrimitiveAuthoring.js";
export {
  crowbarWeaponDefinition,
  knifeWeaponDefinition,
  pistolWeaponDefinition,
} from "./sampleDefinitions.js";
export { WeaponPresenter, type WeaponPresenterConfig } from "./WeaponPresenter.js";

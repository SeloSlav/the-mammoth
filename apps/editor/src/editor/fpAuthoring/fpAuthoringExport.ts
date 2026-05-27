import {
  buildWeaponFirstPersonPresentationMergeFromPickList as buildWeaponFirstPersonMergeFromPickListImpl,
  mergeWeaponFpViewmodelForSave,
  type FpAuthoringPick,
  type WeaponFirstPersonAuthoringPresentationMerge as WeaponFirstPersonAuthoringMerge,
  type WeaponFirstPersonPersistRefs,
  type WeaponMountAuthorMerge as WeaponMountAuthoring,
} from "@the-mammoth/engine";

export type { WeaponMountAuthoring, WeaponFirstPersonAuthoringMerge, WeaponFirstPersonPersistRefs };

/** Reads live transforms for save (`persistRefs` bridges grip socket + weapon mesh vs simplified pick list). */
export function buildWeaponFirstPersonMergeFromPicks(
  picks: FpAuthoringPick[],
  persistRefs?: WeaponFirstPersonPersistRefs,
): WeaponFirstPersonAuthoringMerge {
  return buildWeaponFirstPersonMergeFromPickListImpl(picks, persistRefs);
}

export { mergeWeaponFpViewmodelForSave };

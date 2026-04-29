import {
  buildWeaponFirstPersonPresentationMergeFromPickList as buildWeaponFirstPersonMergeFromPickListImpl,
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

/**
 * Merges an authoring patch into the existing on-disk `firstPerson.fpViewmodel`.
 * {@link buildWeaponFirstPersonMergeFromPicks} only includes keys for picks that exist, so a naive
 * `fpViewmodel: patch ?? prev` would drop e.g. `gripAnchorPositionM` when the patch only
 * carried `hand` — the game would then fall back to defaults and no longer match the editor.
 */
export function mergeWeaponFpViewmodelForSave(
  prev: unknown,
  patch: Record<string, unknown> | null,
): unknown {
  if (patch == null) return prev;
  const base =
    prev && typeof prev === "object"
      ? { ...(prev as Record<string, unknown>) }
      : ({} as Record<string, unknown>);
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    if (key === "hand") {
      const bh = base.hand;
      if (bh && typeof bh === "object" && pv && typeof pv === "object") {
        out.hand = { ...(bh as Record<string, unknown>), ...(pv as Record<string, unknown>) };
      } else {
        out.hand = pv;
      }
    } else if (key === "rigRoot") {
      const br = base.rigRoot;
      if (br && typeof br === "object" && pv && typeof pv === "object") {
        out.rigRoot = { ...(br as Record<string, unknown>), ...(pv as Record<string, unknown>) };
      } else {
        out.rigRoot = pv;
      }
    } else {
      out[key] = pv;
    }
  }
  return out;
}

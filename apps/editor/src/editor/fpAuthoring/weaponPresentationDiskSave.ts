import { ALL_WEAPON_DEFINITIONS, type PrimitiveSwingKeyframe, type WeaponDefinition } from "@the-mammoth/engine";
import {
  buildWeaponFirstPersonMergeFromPicks,
  mergeWeaponFpViewmodelForSave,
} from "./fpAuthoringExport.js";
import { notifyWeaponPresentationSavedToDisk } from "./weaponPresentationEditorSync.js";
import { getFpViewmodelAuthoringPicks, getFpViewmodelPresenterForAuthoring } from "./fpViewmodelAuthoringBridge.js";
import { assertValidWeaponPresentationJson } from "../../vite/weaponPresentationSaveValidate.js";

/** Kept in lockstep with {@link ALL_WEAPON_DEFINITIONS} — add a weapon in engine once, editor follows. */
export const FP_AUTHORABLE_WEAPON_IDS: readonly WeaponDefinition["id"][] =
  ALL_WEAPON_DEFINITIONS.map((d) => d.id);

export type FpAuthorWeaponId = WeaponDefinition["id"];

export function isFpAuthorWeaponId(id: string): id is FpAuthorWeaponId {
  return ALL_WEAPON_DEFINITIONS.some((d) => d.id === id);
}

/**
 * Reads the live FP picks, merges into `content/weapons/<weaponId>.presentation.json`, validates,
 * POSTs to the editor middleware — same contract as the Save layout button.
 */
export async function saveWeaponPresentationFromEditor(
  weaponId: FpAuthorWeaponId,
  opts?: { meleeSwingDraft?: PrimitiveSwingKeyframe[] | null },
): Promise<void> {
  const swingDraft = opts?.meleeSwingDraft ?? null;
  const picks = getFpViewmodelAuthoringPicks();
  if (picks.length === 0) {
    throw new Error("Models are still loading — wait for the hand and weapon, then try again.");
  }
  const pres = getFpViewmodelPresenterForAuthoring();
  // Do not call reconcileFpWeaponGripAnchorToPresentationHand() here: it would snap the grip to
  // hand × the *previous* JSON grip offset and destroy hand-only edits (e.g. hand forward of the gun).
  const merge = buildWeaponFirstPersonMergeFromPicks(picks, {
    gripAnchor: pres?.getFpGripAnchorObject(),
    weaponVisual: pres?.getFpWeaponVisualObject(),
  });
  const hasMount = merge.mount != null;
  const hasFp = merge.fpViewmodel != null;
  if (!hasMount && !hasFp) {
    throw new Error("Nothing to save yet — select a part and move it with the gizmo first.");
  }
  const curRes = await fetch(`/content/weapons/${weaponId}.presentation.json`, {
    cache: "no-store",
  });
  if (!curRes.ok) throw new Error(`Could not read presentation file (${curRes.status}).`);
  const cur = (await curRes.json()) as Record<string, unknown>;
  const prev = (cur.firstPerson ?? {}) as Record<string, unknown>;
  if (!Array.isArray(prev.meleeSwing)) {
    throw new Error("Presentation file looks corrupt (missing swing data). Restore from git.");
  }
  cur.firstPerson = {
    ...prev,
    mount: merge.mount ?? prev.mount,
    fpViewmodel: mergeWeaponFpViewmodelForSave(
      prev.fpViewmodel,
      merge.fpViewmodel as Record<string, unknown> | null,
    ),
    ...(swingDraft && swingDraft.length > 0 ? { meleeSwing: swingDraft } : {}),
  };
  const json = JSON.stringify(cur, null, 2);
  assertValidWeaponPresentationJson(JSON.parse(json));
  const saveRes = await fetch("/__editor/save-weapon-presentation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weaponId, json }),
  });
  if (!saveRes.ok) throw new Error((await saveRes.text()) || `Save failed (${saveRes.status}).`);
  notifyWeaponPresentationSavedToDisk(weaponId, json);
}

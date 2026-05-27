import {
  applyWeaponPrimitivePresentationDoc,
  buildWeaponFirstPersonPresentationMergeFromPickList,
  mergeWeaponFpViewmodelForSave,
  parseWeaponPrimitivePresentationDoc,
  type PlayerPresentationManager,
} from "@the-mammoth/engine";

function requireEquippedWeaponId(presentation: PlayerPresentationManager): string {
  const def = presentation.getLocalWeaponDefinition();
  if (!def) {
    throw new Error("No weapon equipped — select a weapon on the hotbar first.");
  }
  return def.id;
}

/**
 * Writes the live FP hand + weapon layout into `content/weapons/<weaponId>.presentation.json`.
 * Dev-only; requires the client Vite save middleware.
 */
export async function saveLocalWeaponPresentationFromAuthoring(
  presentation: PlayerPresentationManager,
): Promise<{ weaponId: string }> {
  const weaponId = requireEquippedWeaponId(presentation);
  const picks = presentation.getFpAuthoringPickList();
  if (picks.length === 0) {
    throw new Error("Viewmodel is still loading — wait for the hand mesh, then try again.");
  }
  const merge = buildWeaponFirstPersonPresentationMergeFromPickList(picks, {
    gripAnchor: presentation.getLocalFpGripAnchorObject(),
    weaponVisual: presentation.getLocalFpWeaponVisualObject(),
  });
  const hasMount = merge.mount != null;
  const hasFp = merge.fpViewmodel != null;
  if (!hasMount && !hasFp) {
    throw new Error("Nothing to save yet — move the hand + weapon with the gizmo first.");
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
  };
  const json = JSON.stringify(cur, null, 2);

  const saveRes = await fetch("/__dev/save-weapon-presentation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weaponId, json }),
  });
  if (!saveRes.ok) throw new Error((await saveRes.text()) || `Save failed (${saveRes.status}).`);

  const doc = parseWeaponPrimitivePresentationDoc(JSON.parse(json));
  applyWeaponPrimitivePresentationDoc(weaponId, doc);
  presentation.reloadLocalWeaponPresentationLayoutForWeapon(weaponId);
  return { weaponId };
}

/** Re-read `content/weapons/<weaponId>.presentation.json` from disk and re-apply the local viewmodel. */
export async function revertLocalWeaponPresentationFromDisk(
  presentation: PlayerPresentationManager,
): Promise<{ weaponId: string }> {
  const weaponId = requireEquippedWeaponId(presentation);
  const res = await fetch(`/content/weapons/${weaponId}.presentation.json`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Could not read presentation file (${res.status}).`);
  const text = await res.text();
  const doc = parseWeaponPrimitivePresentationDoc(JSON.parse(text));
  applyWeaponPrimitivePresentationDoc(weaponId, doc);
  presentation.reloadLocalWeaponPresentationLayoutForWeapon(weaponId);
  return { weaponId };
}

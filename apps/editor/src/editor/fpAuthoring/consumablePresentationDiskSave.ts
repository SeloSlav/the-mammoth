import { getFpConsumableSession } from "./fpConsumableAuthoringBridge.js";

/**
 * Consumable IDs that have (or will have) first-person viewmodel GLBs under
 * `apps/client/public/static/models/consumables/{id}.glb`.
 * Kept in lockstep with the GLB files — add the GLB and the catalog entry, then append here.
 */
export const FP_AUTHORABLE_CONSUMABLE_IDS: readonly string[] = ["water_bottle", "apple", "rakija"];

export type FpAuthorConsumableId = (typeof FP_AUTHORABLE_CONSUMABLE_IDS)[number];

export function isFpAuthorConsumableId(id: string): id is FpAuthorConsumableId {
  return (FP_AUTHORABLE_CONSUMABLE_IDS as readonly string[]).includes(id);
}

/**
 * Reads the live consumable session's gizmo state, merges into the on-disk presentation JSON,
 * and POSTs to the editor middleware — same save contract as Save layout for weapons.
 */
export async function saveConsumablePresentationFromEditor(
  consumableId: FpAuthorConsumableId,
): Promise<void> {
  const session = getFpConsumableSession();
  if (!session || !session.isReady()) {
    throw new Error("Consumable is still loading — wait for the mesh to appear, then try again.");
  }
  const mount = session.readMount();
  if (!mount) {
    throw new Error("Could not read consumable position — mesh may not be ready yet.");
  }

  let cur: Record<string, unknown> = { version: 1, firstPerson: {} };
  const curRes = await fetch(`/content/consumables/${consumableId}.presentation.json`, {
    cache: "no-store",
  });
  if (curRes.ok) {
    try {
      cur = JSON.parse(await curRes.text()) as Record<string, unknown>;
    } catch {
      // Missing files may resolve to the HTML app shell during dev; overwrite with a fresh doc.
    }
  }

  cur.version = 1;
  cur.firstPerson = {
    ...((cur.firstPerson as Record<string, unknown>) ?? {}),
    mount,
  };

  const json = JSON.stringify(cur, null, 2);
  const saveRes = await fetch("/__editor/save-consumable-presentation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consumableId, json }),
  });
  if (!saveRes.ok) {
    throw new Error((await saveRes.text()) || `Save failed (${saveRes.status}).`);
  }
}

/** Gameplay-readable apartment notebook (`notebook.glb` on the desk). */

export const OWNED_APARTMENT_MODEL_NOTEBOOK = "static/models/objects/notebook.glb" as const;

/** Horizontal interact cylinder from decor anchor (m). */
export const APARTMENT_NOTEBOOK_INTERACT_RADIUS_M = 1.1 as const;

export const APARTMENT_NOTEBOOK_PROMPT_LABEL = "Read notebook" as const;

export function isApartmentNotebookModelRelPath(modelRelPath: string): boolean {
  const norm = modelRelPath.trim().replace(/^\/+/u, "");
  return norm === OWNED_APARTMENT_MODEL_NOTEBOOK || norm.endsWith("/notebook.glb");
}
export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function editorSaveHttpError(path: string, res: Response, body: string): Error {
  const hint =
    res.status === 403 && body.includes("EDITOR_SAVE")
      ? " Set EDITOR_SAVE=1 when starting Vite (the editor dev script does this by default)."
      : res.status === 404
        ? " Open the editor from the Vite URL printed in the terminal (port 5174). Do not use `serve dist`, the raw client app (5173), or opening index.html directly — those have no /__editor API. Use `pnpm editor:dev` or `pnpm --filter @the-mammoth/editor dev` (or `pnpm exec vite preview` from apps/editor after build)."
        : "";
  return new Error(`${body || res.statusText} (${res.status} ${path})${hint}`);
}

export async function postSaveFloor(
  floorDocId: string,
  json: string,
): Promise<string> {
  const path = "/__editor/save-floor";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ floorDocId, json }),
  });
  const t = await res.text();
  if (!res.ok) throw editorSaveHttpError(path, res, t);
  return t;
}

export async function postSaveInterior(
  interiorDocId: string,
  json: string,
): Promise<string> {
  const path = "/__editor/save-interior";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interiorDocId, json }),
  });
  const t = await res.text();
  if (!res.ok) throw editorSaveHttpError(path, res, t);
  return t;
}

export async function postSaveCell(cellDocId: string, json: string): Promise<string> {
  const path = "/__editor/save-cell";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cellDocId, json }),
  });
  const t = await res.text();
  if (!res.ok) throw editorSaveHttpError(path, res, t);
  return t;
}

export async function postSavePrefab(prefabDefId: string, json: string): Promise<string> {
  const path = "/__editor/save-prefab";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefabDefId, json }),
  });
  const t = await res.text();
  if (!res.ok) throw editorSaveHttpError(path, res, t);
  return t;
}

export async function postSaveFloorOverride(
  floorOverrideDocId: string,
  json: string,
): Promise<string> {
  const path = "/__editor/save-floor-override";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ floorOverrideDocId, json }),
  });
  const t = await res.text();
  if (!res.ok) throw editorSaveHttpError(path, res, t);
  return t;
}

export async function postSaveBuilding(json: string): Promise<string> {
  const path = "/__editor/save-building";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json }),
  });
  const t = await res.text();
  if (!res.ok) throw editorSaveHttpError(path, res, t);
  return t;
}

export async function postSaveElevatorCab(json: string): Promise<string> {
  const path = "/__editor/save-elevator-cab";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json }),
  });
  const t = await res.text();
  if (!res.ok) throw editorSaveHttpError(path, res, t);
  return t;
}

export async function postSaveLandingKit(json: string): Promise<string> {
  const path = "/__editor/save-landing-kit";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json }),
  });
  const t = await res.text();
  if (!res.ok) throw editorSaveHttpError(path, res, t);
  return t;
}

export async function postSaveStairWell(json: string): Promise<string> {
  const path = "/__editor/save-stairwell";
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json }),
  });
  const t = await res.text();
  if (!res.ok) throw editorSaveHttpError(path, res, t);
  return t;
}

export async function fetchCollisionArtifactsStatus(): Promise<unknown> {
  const res = await fetch("/__editor/collision-artifacts-status", { cache: "no-store" });
  const t = await res.text();
  if (!res.ok) throw new Error(t || res.statusText);
  return JSON.parse(t) as unknown;
}

export async function postRebuildServerCollision(): Promise<unknown> {
  const res = await fetch("/__editor/rebuild-server-collision", {
    method: "POST",
  });
  const t = await res.text();
  if (!res.ok) throw new Error(t || res.statusText);
  return JSON.parse(t) as unknown;
}

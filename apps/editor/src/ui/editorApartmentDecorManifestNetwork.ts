export type SyncApartmentDecorManifestResult = {
  ok: true;
  entryCount: number;
  manifestPath: string;
};

function editorManifestHttpError(path: string, res: Response, body: string): Error {
  const hints: string[] = [];
  if (res.status === 403 && body.includes("EDITOR_SAVE")) {
    hints.push("Set EDITOR_SAVE=1 when starting the editor dev server.");
  }
  if (res.status === 404 && path.startsWith("/__editor/")) {
    hints.push("Restart the editor dev server (pnpm editor:dev) so Vite reloads dev middleware.");
  }
  const hint = hints.length > 0 ? ` ${hints.join(" ")}` : "";
  return new Error(`${body || res.statusText} (${res.status} ${path})${hint}`);
}

export async function postSyncApartmentDecorManifest(): Promise<SyncApartmentDecorManifestResult> {
  const path = "/__editor/sync-apartment-decor-manifest";
  const res = await fetch(path, { method: "POST", cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw editorManifestHttpError(path, res, text);
  return JSON.parse(text) as SyncApartmentDecorManifestResult;
}

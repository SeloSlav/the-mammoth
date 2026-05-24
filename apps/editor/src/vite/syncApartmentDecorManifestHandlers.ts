import type { ServerResponse } from "node:http";
import { syncApartmentDecorManifestFromRepoRoot } from "../../../../scripts/lib/sync-apartment-decor-manifest-core.mjs";

function sendJson(res: ServerResponse, payload: unknown, statusCode = 200): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export type SyncApartmentDecorManifestResult = {
  ok: true;
  entryCount: number;
  manifestPath: string;
};

export async function handleSyncApartmentDecorManifest(
  repoRoot: string,
  res: ServerResponse,
  ensureEditorSaveEnabled: (res: ServerResponse) => boolean,
): Promise<void> {
  if (!ensureEditorSaveEnabled(res)) return;
  try {
    const { entryCount, manifestPath } = syncApartmentDecorManifestFromRepoRoot(repoRoot);
    sendJson(res, { ok: true, entryCount, manifestPath } satisfies SyncApartmentDecorManifestResult);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(e instanceof Error ? e.message : "error");
  }
}

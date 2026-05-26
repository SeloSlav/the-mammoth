import type { IncomingMessage, ServerResponse } from "node:http";
import { syncOwnedApartmentDecorDefaultScaleFromRepoRoot } from "../../../../scripts/lib/sync-owned-apartment-decor-default-scale-core.mjs";

function sendJson(res: ServerResponse, payload: unknown, statusCode = 200): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export type SyncOwnedApartmentDecorDefaultScaleRequest = {
  /** When set, extract scales from the live editor layout instead of the saved JSON on disk. */
  placedItems?: ReadonlyArray<{
    modelRelPath: string;
    uniformScale: number;
    verticalScaleMul?: number;
  }>;
};

export type SyncOwnedApartmentDecorDefaultScaleResult = {
  ok: true;
  source: "editor" | "disk";
  modelCount: number;
  placementCount: number;
  builtinsPath: string;
  outPath: string;
};

export function parseSyncOwnedApartmentDecorDefaultScaleBody(
  body: SyncOwnedApartmentDecorDefaultScaleRequest,
): { placedItems?: SyncOwnedApartmentDecorDefaultScaleRequest["placedItems"] } | { error: string } {
  if (body.placedItems == null) {
    return {};
  }
  if (!Array.isArray(body.placedItems)) {
    return { error: "placedItems must be an array when provided" };
  }
  return { placedItems: body.placedItems };
}

export async function handleSyncOwnedApartmentDecorDefaultScale(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  ensureEditorSaveEnabled: (res: ServerResponse) => boolean,
): Promise<void> {
  if (!ensureEditorSaveEnabled(res)) return;

  let body: SyncOwnedApartmentDecorDefaultScaleRequest = {};
  if (req.method === "POST") {
    try {
      const raw = await readJsonBody(req);
      if (raw.trim().length > 0) {
        body = JSON.parse(raw) as SyncOwnedApartmentDecorDefaultScaleRequest;
      }
    } catch {
      sendJson(res, { error: "Invalid JSON body" }, 400);
      return;
    }
  }

  const parsed = parseSyncOwnedApartmentDecorDefaultScaleBody(body);
  if ("error" in parsed) {
    sendJson(res, { error: parsed.error }, 400);
    return;
  }

  try {
    const result = syncOwnedApartmentDecorDefaultScaleFromRepoRoot(repoRoot, {
      placedItems: parsed.placedItems,
    });
    sendJson(res, result satisfies SyncOwnedApartmentDecorDefaultScaleResult);
  } catch (e) {
    sendJson(res, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

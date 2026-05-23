// @ts-nocheck — dev middleware calls repo scripts/lib/*.mjs directly at runtime.
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  APARTMENT_DECOR_OBJECTS_PREFIX,
  normalizeModelRelPath,
  optimizeGlb,
  readGlbOptimizeStatus,
  revertGlbFromBackup,
} from "../../../../scripts/lib/glb-optimize-core.mjs";

const MODELS_ROOT_REL = "apps/client/public";
const BACKUP_DIR_REL = "content/models/glb-source-backups";

export type ApartmentDecorGlbOptimizeRequest = {
  modelRelPath: string;
  /** Fraction of triangles to keep, (0, 1]. Omit or 1 = reorder only. */
  ratio?: number;
  compressTextures?: boolean;
  /** When true, restore backup before optimizing (used with texture recompress). */
  fromBackup?: boolean;
};

function apartmentDecorGlbPaths(repoRoot: string) {
  return {
    modelsRoot: path.join(repoRoot, MODELS_ROOT_REL),
    backupDir: path.join(repoRoot, BACKUP_DIR_REL),
  };
}

function normalizeApartmentDecorModelRelPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return normalizeModelRelPath(raw, { apartmentOnly: true });
}

function parseRatio(raw: unknown): number | null {
  if (raw == null) return null;
  const ratio = Number(raw);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) return null;
  return ratio;
}

function readJsonBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, payload: unknown, statusCode = 200): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export function resolveApartmentDecorGlbOptimizeOptions(body: ApartmentDecorGlbOptimizeRequest): {
  rel: string;
  simplifyOptions: { ratio: number } | null;
  compressTextures: boolean;
  fromBackup: boolean;
} | { error: string } {
  const rel = normalizeApartmentDecorModelRelPath(body.modelRelPath);
  if (!rel) {
    return { error: `Invalid apartment decor model path: ${String(body.modelRelPath)}` };
  }
  if (!rel.startsWith(APARTMENT_DECOR_OBJECTS_PREFIX)) {
    return { error: `Expected path under ${APARTMENT_DECOR_OBJECTS_PREFIX}` };
  }
  const ratio = parseRatio(body.ratio);
  if (body.ratio != null && ratio == null) {
    return { error: "ratio must be a number in (0, 1]" };
  }
  const compressTextures = body.compressTextures === true;
  const fromBackup = body.fromBackup === true;
  return {
    rel,
    simplifyOptions: ratio != null && ratio < 1 ? { ratio } : null,
    compressTextures,
    fromBackup,
  };
}

export async function handleApartmentDecorGlbOptimizeStatus(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const rel = normalizeApartmentDecorModelRelPath(url.searchParams.get("rel") ?? "");
  if (!rel) {
    sendJson(res, { error: "Missing or invalid rel query param" }, 400);
    return;
  }
  const { modelsRoot, backupDir } = apartmentDecorGlbPaths(repoRoot);
  sendJson(res, readGlbOptimizeStatus({ rel, modelsRoot, backupDir }));
}

export async function handleApartmentDecorGlbOptimize(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  ensureEditorSaveEnabled: (res: ServerResponse) => boolean,
): Promise<void> {
  if (!ensureEditorSaveEnabled(res)) return;
  let body: ApartmentDecorGlbOptimizeRequest;
  try {
    body = JSON.parse(await readJsonBody(req)) as ApartmentDecorGlbOptimizeRequest;
  } catch {
    sendJson(res, { error: "Invalid JSON body" }, 400);
    return;
  }
  const parsed = resolveApartmentDecorGlbOptimizeOptions(body);
  if ("error" in parsed) {
    sendJson(res, { error: parsed.error }, 400);
    return;
  }
  const { modelsRoot, backupDir } = apartmentDecorGlbPaths(repoRoot);
  const fullPath = path.join(modelsRoot, parsed.rel);
  if (!fs.existsSync(fullPath)) {
    sendJson(res, { error: "Model file not found on disk" }, 404);
    return;
  }
  if (parsed.fromBackup && parsed.compressTextures) {
    const backupPath = path.join(backupDir, parsed.rel);
    if (!fs.existsSync(backupPath)) {
      sendJson(res, { error: "No backup yet — run optimize once without from-backup first" }, 400);
      return;
    }
  }
  try {
    const result = await optimizeGlb({
      rel: parsed.rel,
      modelsRoot,
      backupDir,
      apply: true,
      reorderIndices: true,
      compressTextures: parsed.compressTextures,
      simplifyOptions: parsed.simplifyOptions,
      fromBackup: parsed.fromBackup,
    });
    sendJson(res, result, result.error ? 500 : 200);
  } catch (err) {
    sendJson(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

export async function handleApartmentDecorGlbRevert(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  ensureEditorSaveEnabled: (res: ServerResponse) => boolean,
): Promise<void> {
  if (!ensureEditorSaveEnabled(res)) return;
  let body: { modelRelPath?: string };
  try {
    body = JSON.parse(await readJsonBody(req)) as { modelRelPath?: string };
  } catch {
    sendJson(res, { error: "Invalid JSON body" }, 400);
    return;
  }
  const rel = normalizeApartmentDecorModelRelPath(body.modelRelPath);
  if (!rel) {
    sendJson(res, { error: "Missing or invalid modelRelPath" }, 400);
    return;
  }
  const { modelsRoot, backupDir } = apartmentDecorGlbPaths(repoRoot);
  const result = revertGlbFromBackup({ rel, modelsRoot, backupDir });
  sendJson(res, result, result.ok ? 200 : 404);
}

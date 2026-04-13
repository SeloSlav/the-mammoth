import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Connect } from "vite";

const FLOOR_DOC_ID_RE = /^floor_[a-z0-9_]+$/;
/** Interior JSON filenames in repo (e.g. lobby_central.json). */
const INTERIOR_DOC_ID_RE = /^[a-z][a-z0-9_]*$/;
const BUILDING_FILENAME = "mammoth.json";

function safeContentFile(repoRoot: string, relFromContent: string): string | null {
  const abs = path.resolve(repoRoot, "content", relFromContent);
  const root = path.resolve(repoRoot, "content");
  if (!abs.startsWith(root)) return null;
  return abs;
}

function readJsonBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Dev-only middleware: serve `content/**` at `/content/...` and optional POST saves
 * when `process.env.EDITOR_SAVE === "1"`.
 */
export function editorDevMiddleware(repoRoot: string): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url?.split("?")[0] ?? "";
    if (!url.startsWith("/content/") && url !== "/content") {
      if (url === "/__editor/save-floor" && req.method === "POST") {
        return handleSaveFloor(repoRoot, req, res, next);
      }
      if (url === "/__editor/save-interior" && req.method === "POST") {
        return handleSaveInterior(repoRoot, req, res, next);
      }
      if (url === "/__editor/save-building" && req.method === "POST") {
        return handleSaveBuilding(repoRoot, req, res, next);
      }
      return next();
    }

    const rel = decodeURIComponent(url.replace(/^\/content\/?/, ""));
    const abs = safeContentFile(repoRoot, rel);
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      try {
        const data = await fs.readFile(abs);
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 200;
        if (req.method === "HEAD") res.end();
        else res.end(data);
      } catch {
        res.statusCode = 404;
        res.end("not found");
      }
      return;
    }

    return next();
  };
}

async function handleSaveFloor(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  if (process.env.EDITOR_SAVE !== "1") {
    res.statusCode = 403;
    res.end("EDITOR_SAVE not enabled");
    return;
  }
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { floorDocId?: string; json?: string };
    const id = body.floorDocId;
    if (typeof id !== "string" || !FLOOR_DOC_ID_RE.test(id)) {
      res.statusCode = 400;
      res.end("invalid floorDocId");
      return;
    }
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json string");
      return;
    }
    const abs = safeContentFile(repoRoot, path.join("building", "floors", `${id}.json`));
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.writeFile(abs, body.json, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, path: abs }));
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : "error");
  }
}

async function handleSaveInterior(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  if (process.env.EDITOR_SAVE !== "1") {
    res.statusCode = 403;
    res.end("EDITOR_SAVE not enabled");
    return;
  }
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { interiorDocId?: string; json?: string };
    const id = body.interiorDocId;
    if (typeof id !== "string" || !INTERIOR_DOC_ID_RE.test(id)) {
      res.statusCode = 400;
      res.end("invalid interiorDocId");
      return;
    }
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json string");
      return;
    }
    const abs = safeContentFile(repoRoot, path.join("interiors", `${id}.json`));
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.writeFile(abs, body.json, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, path: abs }));
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : "error");
  }
}

async function handleSaveBuilding(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  if (process.env.EDITOR_SAVE !== "1") {
    res.statusCode = 403;
    res.end("EDITOR_SAVE not enabled");
    return;
  }
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { json?: string };
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json string");
      return;
    }
    const abs = safeContentFile(repoRoot, path.join("building", BUILDING_FILENAME));
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.writeFile(abs, body.json, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, path: abs }));
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : "error");
  }
}

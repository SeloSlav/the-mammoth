import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Connect } from "vite";
// Repo-relative: `@the-mammoth/engine` entry pulls `index.ts` → Node config load dies on `./fpLocomotion.js` specifiers.
import {
  ALL_WEAPON_DEFINITIONS,
  WEAPON_DEFINITION_ID_SET,
} from "../../../../packages/engine/src/weapons/weaponRegistry";
import { assertValidWeaponPresentationJson } from "./weaponPresentationSaveValidate.js";

const FLOOR_DOC_ID_RE = /^floor_[a-z0-9_]+$/;
/** Interior JSON filenames in repo (e.g. lobby_central.json). */
const INTERIOR_DOC_ID_RE = /^[a-z][a-z0-9_]*$/;
const BUILDING_FILENAME = "mammoth.json";
const WEAPON_STEM_RE = /^[a-z][a-z0-9_]*$/;

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
      if (url === "/__editor/weapon-asset-survey" && req.method === "GET") {
        return void handleWeaponAssetSurvey(repoRoot, res).catch((e) => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(e instanceof Error ? e.message : "error");
        });
      }
      if (url === "/__editor/save-floor" && req.method === "POST") {
        return handleSaveFloor(repoRoot, req, res, next);
      }
      if (url === "/__editor/save-interior" && req.method === "POST") {
        return handleSaveInterior(repoRoot, req, res, next);
      }
      if (url === "/__editor/save-building" && req.method === "POST") {
        return handleSaveBuilding(repoRoot, req, res, next);
      }
      if (url === "/__editor/save-weapon-presentation" && req.method === "POST") {
        return handleSaveWeaponPresentation(repoRoot, req, res, next);
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

async function handleWeaponAssetSurvey(repoRoot: string, res: ServerResponse): Promise<void> {
  const weaponsDir = path.resolve(repoRoot, "apps/client/public/static/models/weapons");
  const contentWeaponsDir = path.resolve(repoRoot, "content/weapons");
  const registryIds = ALL_WEAPON_DEFINITIONS.map((d) => d.id).sort();

  const glbStems = await readWeaponDirStems(weaponsDir, ".glb");
  const presentationStems = await readPresentationStems(contentWeaponsDir);

  const registrySet = new Set<string>(registryIds);
  const glbSet = new Set<string>(glbStems);
  const glbWithoutRegistry = glbStems.filter((id) => !registrySet.has(id));
  const registryWithoutGlb = registryIds.filter((id) => !glbSet.has(id));
  const presentationWithoutRegistry = presentationStems.filter((id) => !registrySet.has(id));

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      registryIds,
      glbStems,
      presentationStems,
      glbWithoutRegistry,
      registryWithoutGlb,
      presentationWithoutRegistry,
    }),
  );
}

async function readWeaponDirStems(absDir: string, suffix: string): Promise<string[]> {
  try {
    const names = await fs.readdir(absDir);
    return names
      .filter((n) => n.endsWith(suffix))
      .map((n) => n.slice(0, -suffix.length))
      .filter((id) => WEAPON_STEM_RE.test(id))
      .sort();
  } catch {
    return [];
  }
}

async function readPresentationStems(absDir: string): Promise<string[]> {
  try {
    const names = await fs.readdir(absDir);
    return names
      .filter((n) => n.endsWith(".presentation.json"))
      .map((n) => n.replace(/\.presentation\.json$/, ""))
      .filter((id) => WEAPON_STEM_RE.test(id))
      .sort();
  } catch {
    return [];
  }
}

async function handleSaveWeaponPresentation(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { weaponId?: string; json?: string };
    if (typeof body.weaponId !== "string" || !WEAPON_DEFINITION_ID_SET.has(body.weaponId)) {
      res.statusCode = 400;
      res.end("missing or invalid weaponId");
      return;
    }
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json");
      return;
    }
    assertValidWeaponPresentationJson(JSON.parse(body.json));
    const abs = safeContentFile(
      repoRoot,
      path.join("weapons", `${body.weaponId}.presentation.json`),
    );
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.writeFile(abs, body.json, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : "error");
  }
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

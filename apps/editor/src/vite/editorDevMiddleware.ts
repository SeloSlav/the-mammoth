import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Connect } from "vite";
import {
  BuildingDocSchema,
  CellDocSchema,
  ElevatorCabDefSchema,
  FloorDocSchema,
  FloorOverrideDocSchema,
  InteriorDocSchema,
  LandingKitDefSchema,
  OwnedApartmentBuiltinsDocSchema,
  PrefabDefSchema,
  StairWellDefSchema,
} from "@the-mammoth/schemas";
// Repo-relative: `@the-mammoth/engine` entry pulls `index.ts` → Node config load dies on `./fpLocomotion.js` specifiers.
import {
  ALL_WEAPON_DEFINITIONS,
  WEAPON_DEFINITION_ID_SET,
} from "../../../../packages/engine/src/weapons/weaponRegistry";
import {
  EDITOR_APARTMENT_KIT_FILE,
  EDITOR_BUILDING_FILE,
  EDITOR_CELLS_DIR,
  EDITOR_FLOOR_OVERRIDES_DIR,
  EDITOR_ELEVATOR_DIR,
  EDITOR_FLOORS_DIR,
  EDITOR_INTERIORS_DIR,
  EDITOR_PREFABS_DIR,
  EDITOR_OWNED_APT_BUILTINS_FILE,
} from "../editor/content/editorContentDiscovery.js";
import {
  collisionArtifactsStampPath,
  computeWorldCollisionSourceFingerprint,
} from "../../../../scripts/worldCollisionArtifacts";
import { assertValidWeaponPresentationJson } from "./weaponPresentationSaveValidate.js";
import { assertValidConsumablePresentationJson } from "./consumablePresentationSaveValidate.js";

/**
 * IDs accepted by the save-consumable-presentation endpoint.
 * Mirrors {@link FP_AUTHORABLE_CONSUMABLE_IDS} in consumablePresentationDiskSave.ts —
 * add new consumable IDs here when their GLB assets are committed.
 */
const FP_CONSUMABLE_AUTHORABLE_IDS: readonly string[] = [
  "water-bottle",
  "apple",
  "rakija",
  "cigarettes",
];
const FP_CONSUMABLE_AUTHORABLE_ID_SET = new Set<string>(FP_CONSUMABLE_AUTHORABLE_IDS);

const FLOOR_DOC_ID_RE = /^floor_[a-z0-9_]+$/;
const INTERIOR_DOC_ID_RE = /^[a-z][a-z0-9_]*$/;
const CELL_DOC_ID_RE = /^[a-z][a-z0-9_]*$/;
const PREFAB_DOC_ID_RE = /^[a-z][a-z0-9_]*$/;
const FLOOR_OVERRIDE_DOC_ID_RE = /^[a-z][a-z0-9_]*(?:__L\d+)?$/;
const BUILDING_FILENAME = "mammoth.json";
/** On-disk model / presentation stems: `a-z`, digits, underscores, hyphens (prefer kebab-case for multi-word). */
const WEAPON_STEM_RE = /^[a-z][a-z0-9_-]*$/;

/** Presentation / GLB stems match catalog `def_id` (kebab-case). */
function pathStemToCatalogId(stem: string): string {
  return stem;
}

function catalogIdHasGlbStem(glbStemSet: ReadonlySet<string>, catalogId: string): boolean {
  return glbStemSet.has(catalogId);
}

const MATERIAL_TEXTURE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ktx2"]);

export type EditorDevMiddlewareOptions = {
  /** Vite `config.base` (e.g. `/` or `/app/`); pathname is stripped before routing. */
  viteBase?: string;
};

/** Strip query, absolute URL form, trailing slash, and optional Vite base. */
function editorRequestPath(req: IncomingMessage, viteBase: string): string {
  let raw = req.url?.split("?")[0] ?? "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      /* keep raw */
    }
  }
  const base =
    viteBase === "/" || viteBase === "" || viteBase === undefined
      ? ""
      : viteBase.endsWith("/")
        ? viteBase.slice(0, -1)
        : viteBase;
  let p = raw;
  if (base && (p === base || p.startsWith(`${base}/`))) {
    p = p.slice(base.length) || "/";
  }
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

function safeContentFile(repoRoot: string, relFromContent: string): string | null {
  const abs = path.resolve(repoRoot, "content", relFromContent);
  const root = path.resolve(repoRoot, "content");
  if (!abs.startsWith(root)) return null;
  return abs;
}

function safeClientPublicMaterialsFile(repoRoot: string, relFromMaterials: string): string | null {
  const abs = path.resolve(repoRoot, "apps/client/public/static/materials", relFromMaterials);
  const root = path.resolve(repoRoot, "apps/client/public/static/materials");
  if (!abs.startsWith(root)) return null;
  return abs;
}

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".ktx2") return "image/ktx2";
  if (ext === ".json") return "application/json";
  return "application/octet-stream";
}

function readJsonBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonStemList(absDir: string): Promise<string[]> {
  try {
    const names = await fs.readdir(absDir);
    return names
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

async function readStaticTextureUrlList(
  absDir: string,
  urlBase: string,
): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!MATERIAL_TEXTURE_EXTS.has(ext)) continue;
      const rel = path.relative(absDir, abs).split(path.sep).join("/");
      out.push(`${urlBase}/${rel}`);
    }
  }
  await walk(absDir);
  return out.sort((a, b) => a.localeCompare(b));
}

function sendJson(res: ServerResponse, payload: unknown, statusCode = 200): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function ensureEditorSaveEnabled(res: ServerResponse): boolean {
  if (process.env.EDITOR_SAVE === "1") return true;
  res.statusCode = 403;
  res.end("EDITOR_SAVE not enabled");
  return false;
}

async function computeCollisionArtifactsStatus(repoRoot: string) {
  const sourceFingerprint = computeWorldCollisionSourceFingerprint(repoRoot);
  const stampPath = collisionArtifactsStampPath(repoRoot);
  let builtFingerprint: string | null = null;
  try {
    const parsed = JSON.parse(await fs.readFile(stampPath, "utf8")) as {
      sourceFingerprint?: string;
    };
    builtFingerprint =
      typeof parsed.sourceFingerprint === "string" ? parsed.sourceFingerprint : null;
  } catch {
    builtFingerprint = null;
  }
  return {
    sourceFingerprint,
    builtFingerprint,
    stale: builtFingerprint !== sourceFingerprint,
    stampPath,
    generatedFiles: [
      "apps/server/src/generated_walk_surfaces.rs",
      "apps/server/src/generated_collision_solids.rs",
    ],
  };
}

/**
 * Dev-only middleware: serve `content/**` at `/content/...` and optional POST saves
 * when `process.env.EDITOR_SAVE === "1"`.
 */
export function editorDevMiddleware(
  repoRoot: string,
  options?: EditorDevMiddlewareOptions,
): Connect.NextHandleFunction {
  const viteBase = options?.viteBase ?? "/";
  return async (req, res, next) => {
    const path = editorRequestPath(req, viteBase);

    if (path === "/content" || path.startsWith("/content/")) {
      const rel = decodeURIComponent(path.replace(/^\/content\/?/, ""));
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
    }

    if (path === "/static/materials" || path.startsWith("/static/materials/")) {
      const rel = decodeURIComponent(path.replace(/^\/static\/materials\/?/, ""));
      const abs = safeClientPublicMaterialsFile(repoRoot, rel);
      if (!abs) {
        res.statusCode = 403;
        res.end("bad path");
        return;
      }

      if (req.method === "GET" || req.method === "HEAD") {
        try {
          const data = await fs.readFile(abs);
          res.setHeader("Content-Type", contentTypeForPath(abs));
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
    }

    if (!path.startsWith("/__editor")) {
      return next();
    }

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      if (path === "/__editor/weapon-asset-survey" && req.method === "GET") {
        return void (await handleWeaponAssetSurvey(repoRoot, res));
      }
      if (path === "/__editor/content-index" && req.method === "GET") {
        return void (await handleContentIndex(repoRoot, res));
      }
      if (path === "/__editor/collision-artifacts-status" && req.method === "GET") {
        return void (await handleCollisionArtifactsStatus(repoRoot, res));
      }
      if (path === "/__editor/save-floor" && req.method === "POST") {
        return void (await handleSaveFloor(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-interior" && req.method === "POST") {
        return void (await handleSaveInterior(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-cell" && req.method === "POST") {
        return void (await handleSaveCell(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-prefab" && req.method === "POST") {
        return void (await handleSavePrefab(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-floor-override" && req.method === "POST") {
        return void (await handleSaveFloorOverride(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-building" && req.method === "POST") {
        return void (await handleSaveBuilding(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-elevator-cab" && req.method === "POST") {
        return void (await handleSaveElevatorCab(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-landing-kit" && req.method === "POST") {
        return void (await handleSaveLandingKit(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-apartment-kit" && req.method === "POST") {
        return void (await handleSaveApartmentKit(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-owned-apartment-builtins" && req.method === "POST") {
        return void (await handleSaveOwnedApartmentBuiltins(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-stairwell" && req.method === "POST") {
        return void (await handleSaveStairWell(repoRoot, req, res, next));
      }
      if (path === "/__editor/save-weapon-presentation" && req.method === "POST") {
        return void (await handleSaveWeaponPresentation(repoRoot, req, res, next));
      }
      if (path === "/__editor/consumable-asset-survey" && req.method === "GET") {
        return void (await handleConsumableAssetSurvey(repoRoot, res));
      }
      if (path === "/__editor/save-consumable-presentation" && req.method === "POST") {
        return void (await handleSaveConsumablePresentation(repoRoot, req, res, next));
      }
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(e instanceof Error ? e.message : "error");
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`__editor: no handler for ${req.method} ${path}`);
  };
}

async function handleContentIndex(repoRoot: string, res: ServerResponse): Promise<void> {
  const materialTextureUrls = await readStaticTextureUrlList(
    path.resolve(repoRoot, "apps/client/public/static/materials"),
    "/static/materials",
  );
  sendJson(res, {
    buildingPath: EDITOR_BUILDING_FILE,
    floorDocIds: await readJsonStemList(path.resolve(repoRoot, "content", EDITOR_FLOORS_DIR)),
    interiorDocIds: await readJsonStemList(
      path.resolve(repoRoot, "content", EDITOR_INTERIORS_DIR),
    ),
    cellDocIds: await readJsonStemList(path.resolve(repoRoot, "content", EDITOR_CELLS_DIR)),
    prefabDefIds: await readJsonStemList(path.resolve(repoRoot, "content", EDITOR_PREFABS_DIR)),
    floorOverrideDocIds: await readJsonStemList(
      path.resolve(repoRoot, "content", EDITOR_FLOOR_OVERRIDES_DIR),
    ),
    elevatorCabRelPath: `${EDITOR_ELEVATOR_DIR}/cab.json`,
    landingKitRelPath: `${EDITOR_ELEVATOR_DIR}/landing_kit.json`,
    apartmentKitRelPath: EDITOR_APARTMENT_KIT_FILE,
    stairWellRelPath: `${EDITOR_ELEVATOR_DIR}/stairwell.json`,
    materialTextureUrls,
  });
}

async function handleSaveElevatorCab(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  if (!ensureEditorSaveEnabled(res)) return;
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { json?: string };
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json string");
      return;
    }
    ElevatorCabDefSchema.parse(JSON.parse(body.json));
    const abs = safeContentFile(repoRoot, path.join(EDITOR_ELEVATOR_DIR, "cab.json"));
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body.json, "utf8");
    sendJson(res, {
      ok: true,
      path: abs,
      collisionArtifactsStatus: await computeCollisionArtifactsStatus(repoRoot),
    });
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : "error");
  }
}

async function handleSaveLandingKit(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  if (!ensureEditorSaveEnabled(res)) return;
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { json?: string };
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json string");
      return;
    }
    LandingKitDefSchema.parse(JSON.parse(body.json));
    const abs = safeContentFile(repoRoot, path.join(EDITOR_ELEVATOR_DIR, "landing_kit.json"));
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body.json, "utf8");
    sendJson(res, {
      ok: true,
      path: abs,
      collisionArtifactsStatus: await computeCollisionArtifactsStatus(repoRoot),
    });
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : "error");
  }
}

async function handleSaveApartmentKit(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  if (!ensureEditorSaveEnabled(res)) return;
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { json?: string };
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json string");
      return;
    }
    LandingKitDefSchema.parse(JSON.parse(body.json));
    const abs = safeContentFile(repoRoot, EDITOR_APARTMENT_KIT_FILE);
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body.json, "utf8");
    sendJson(res, {
      ok: true,
      path: abs,
      collisionArtifactsStatus: await computeCollisionArtifactsStatus(repoRoot),
    });
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : "error");
  }
}

async function handleSaveOwnedApartmentBuiltins(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  if (!ensureEditorSaveEnabled(res)) return;
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { json?: string };
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json string");
      return;
    }
    OwnedApartmentBuiltinsDocSchema.parse(JSON.parse(body.json));
    const abs = safeContentFile(repoRoot, EDITOR_OWNED_APT_BUILTINS_FILE);
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body.json, "utf8");
    sendJson(res, {
      ok: true,
      path: abs,
      collisionArtifactsStatus: await computeCollisionArtifactsStatus(repoRoot),
    });
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : "error");
  }
}

async function handleSaveStairWell(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  if (!ensureEditorSaveEnabled(res)) return;
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { json?: string };
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json string");
      return;
    }
    StairWellDefSchema.parse(JSON.parse(body.json));
    const abs = safeContentFile(repoRoot, path.join(EDITOR_ELEVATOR_DIR, "stairwell.json"));
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body.json, "utf8");
    sendJson(res, {
      ok: true,
      path: abs,
      collisionArtifactsStatus: await computeCollisionArtifactsStatus(repoRoot),
    });
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : "error");
  }
}

async function handleCollisionArtifactsStatus(
  repoRoot: string,
  res: ServerResponse,
): Promise<void> {
  sendJson(res, await computeCollisionArtifactsStatus(repoRoot));
}

async function handleWeaponAssetSurvey(repoRoot: string, res: ServerResponse): Promise<void> {
  const weaponsDir = path.resolve(repoRoot, "apps/client/public/static/models/weapons");
  const contentWeaponsDir = path.resolve(repoRoot, "content/weapons");
  const registryIds = ALL_WEAPON_DEFINITIONS.map((d) => d.id).sort();

  const glbStems = await readWeaponDirStems(weaponsDir, ".glb");
  const presentationStems = await readPresentationStems(contentWeaponsDir);

  const registrySet = new Set<string>(registryIds);
  const glbSet = new Set<string>(glbStems);
  const glbWithoutRegistry = glbStems.filter((stem) => !registrySet.has(pathStemToCatalogId(stem)));
  const registryWithoutGlb = registryIds.filter((id) => !catalogIdHasGlbStem(glbSet, id));
  const presentationWithoutRegistry = presentationStems.filter(
    (stem) => !registrySet.has(pathStemToCatalogId(stem)),
  );

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

async function handleValidatedSave(args: {
  repoRoot: string;
  req: IncomingMessage;
  res: ServerResponse;
  idKey: string;
  idPattern: RegExp;
  relPath: (id: string) => string;
  parseJson: (raw: unknown) => unknown;
}): Promise<void> {
  if (!ensureEditorSaveEnabled(args.res)) return;
  const raw = await readJsonBody(args.req);
  const body = JSON.parse(raw) as Record<string, unknown>;
  const id = body[args.idKey];
  if (typeof id !== "string" || !args.idPattern.test(id)) {
    args.res.statusCode = 400;
    args.res.end(`invalid ${args.idKey}`);
    return;
  }
  if (typeof body.json !== "string") {
    args.res.statusCode = 400;
    args.res.end("missing json string");
    return;
  }
  args.parseJson(JSON.parse(body.json));
  const abs = safeContentFile(args.repoRoot, args.relPath(id));
  if (!abs) {
    args.res.statusCode = 403;
    args.res.end("bad path");
    return;
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body.json, "utf8");
  sendJson(args.res, {
    ok: true,
    path: abs,
    collisionArtifactsStatus: await computeCollisionArtifactsStatus(args.repoRoot),
  });
}

async function handleSaveFloor(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  await handleValidatedSave({
    repoRoot,
    req,
    res,
    idKey: "floorDocId",
    idPattern: FLOOR_DOC_ID_RE,
    relPath: (id) => path.join(EDITOR_FLOORS_DIR, `${id}.json`),
    parseJson: (raw) => FloorDocSchema.parse(raw),
  });
}

async function handleSaveInterior(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  await handleValidatedSave({
    repoRoot,
    req,
    res,
    idKey: "interiorDocId",
    idPattern: INTERIOR_DOC_ID_RE,
    relPath: (id) => path.join(EDITOR_INTERIORS_DIR, `${id}.json`),
    parseJson: (raw) => InteriorDocSchema.parse(raw),
  });
}

async function handleSaveCell(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  await handleValidatedSave({
    repoRoot,
    req,
    res,
    idKey: "cellDocId",
    idPattern: CELL_DOC_ID_RE,
    relPath: (id) => path.join(EDITOR_CELLS_DIR, `${id}.json`),
    parseJson: (raw) => CellDocSchema.parse(raw),
  });
}

async function handleSavePrefab(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  await handleValidatedSave({
    repoRoot,
    req,
    res,
    idKey: "prefabDefId",
    idPattern: PREFAB_DOC_ID_RE,
    relPath: (id) => path.join(EDITOR_PREFABS_DIR, `${id}.json`),
    parseJson: (raw) => PrefabDefSchema.parse(raw),
  });
}

async function handleSaveFloorOverride(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  await handleValidatedSave({
    repoRoot,
    req,
    res,
    idKey: "floorOverrideDocId",
    idPattern: FLOOR_OVERRIDE_DOC_ID_RE,
    relPath: (id) => path.join(EDITOR_FLOOR_OVERRIDES_DIR, `${id}.json`),
    parseJson: (raw) => FloorOverrideDocSchema.parse(raw),
  });
}

async function handleConsumableAssetSurvey(repoRoot: string, res: ServerResponse): Promise<void> {
  const consumablesModelDir = path.resolve(
    repoRoot,
    "apps/client/public/static/models/consumables",
  );
  const contentConsumablesDir = path.resolve(repoRoot, "content/consumables");

  // GLBs: flat layout — consumables/{id}.glb
  const glbIds = await readWeaponDirStems(consumablesModelDir, ".glb");

  const presentationStems = await readPresentationStems(contentConsumablesDir);
  const authorableSet = FP_CONSUMABLE_AUTHORABLE_ID_SET;
  const glbSet = new Set(glbIds);

  const glbWithoutAuthorable = glbIds.filter((stem) => !authorableSet.has(pathStemToCatalogId(stem)));
  const authorableWithoutGlb = FP_CONSUMABLE_AUTHORABLE_IDS.filter((id) => !catalogIdHasGlbStem(glbSet, id));
  const presentationWithoutAuthorable = presentationStems.filter(
    (stem) => !authorableSet.has(pathStemToCatalogId(stem)),
  );

  sendJson(res, {
    authorableIds: [...FP_CONSUMABLE_AUTHORABLE_IDS],
    glbIds,
    presentationStems,
    glbWithoutAuthorable,
    authorableWithoutGlb,
    presentationWithoutAuthorable,
  });
}

async function handleSaveConsumablePresentation(
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  void next;
  try {
    const raw = await readJsonBody(req);
    const body = JSON.parse(raw) as { consumableId?: string; json?: string };
    if (
      typeof body.consumableId !== "string" ||
      !FP_CONSUMABLE_AUTHORABLE_ID_SET.has(body.consumableId)
    ) {
      res.statusCode = 400;
      res.end("missing or invalid consumableId");
      return;
    }
    if (typeof body.json !== "string") {
      res.statusCode = 400;
      res.end("missing json");
      return;
    }
    assertValidConsumablePresentationJson(JSON.parse(body.json));
    const abs = safeContentFile(
      repoRoot,
      path.join("consumables", `${body.consumableId}.presentation.json`),
    );
    if (!abs) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body.json, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
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
  if (!ensureEditorSaveEnabled(res)) return;
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
    BuildingDocSchema.parse(JSON.parse(body.json));
    await fs.writeFile(abs, body.json, "utf8");
    sendJson(res, {
      ok: true,
      path: abs,
      collisionArtifactsStatus: await computeCollisionArtifactsStatus(repoRoot),
    });
  } catch (e) {
    res.statusCode = 500;
    res.end(e instanceof Error ? e.message : "error");
  }
}

/**
 * Safe GLB optimization via meshoptimizer index reorder (GPU vertex-cache locality).
 * Does NOT decimate geometry — triangle count and silhouette stay unchanged.
 *
 * Texture compression is optional and off by default for apartment decor imports.
 */

import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { reorder, simplify, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

/** Repo-relative prefix for apartment decor import GLBs (editor + in-game placement). */
export const APARTMENT_DECOR_OBJECTS_PREFIX = "static/models/objects/";

/** Procedural runtime paths — skip when absent on disk. */
export const SKIP_MODEL_REL_PATHS = new Set(["static/models/objects/window-shutter.glb"]);

/** Max WebP edge length by folder. Only used when compressTextures=true. */
const TEXTURE_MAX_BY_PREFIX = [
  { prefix: "static/models/players/", texSize: 2048 },
  { prefix: "static/models/npcs/", texSize: 2048 },
  { prefix: "static/models/fp/", texSize: 2048 },
  { prefix: "static/models/viewmodels/", texSize: 1024 },
  { prefix: "static/models/weapons/", texSize: 1024 },
  { prefix: APARTMENT_DECOR_OBJECTS_PREFIX, texSize: 1024 },
  { prefix: "static/models/items/", texSize: 1024 },
  { prefix: "static/models/consumables/", texSize: 1024 },
];

const DEFAULT_TEXTURE_MAX = 1024;
const TEXTURE_COMPRESS_MIN_BYTES = 500_000;
const SKIP_TINY_WEBP_MAX_BYTES = 200_000;
const SKIP_WEBP_MAX_BYTES = 2_000_000;

export function countTrianglesInGlbFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  let total = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue;
      if (prim.indices !== undefined) {
        total += Math.floor(gltf.accessors[prim.indices].count / 3);
      } else if (prim.attributes?.POSITION !== undefined) {
        total += Math.floor(gltf.accessors[prim.attributes.POSITION].count / 3);
      }
    }
  }
  return total;
}

function readGltfJson(filePath) {
  const buf = fs.readFileSync(filePath);
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
}

function glbUsesOnlyWebpTextures(filePath) {
  const gltf = readGltfJson(filePath);
  const images = gltf.images ?? [];
  if (images.length === 0) return false;
  return images.every((img) => img.mimeType === "image/webp");
}

export function resolveTextureMaxSize(rel) {
  for (const tier of TEXTURE_MAX_BY_PREFIX) {
    if (rel.startsWith(tier.prefix)) return tier.texSize;
  }
  return DEFAULT_TEXTURE_MAX;
}

export function walkStaticModelGlbs(staticModelsRoot, relPrefix = "static/models") {
  const out = [];

  function walk(absDir) {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".glb")) continue;
      const rel = `${relPrefix}/${path.relative(staticModelsRoot, abs).replaceAll("\\", "/")}`;
      if (SKIP_MODEL_REL_PATHS.has(rel)) continue;
      out.push(rel);
    }
  }

  walk(staticModelsRoot);
  return out.sort((a, b) => a.localeCompare(b));
}

/** GLBs under static/models/objects/ — apartment decor import catalog only. */
export function walkApartmentDecorGlbs(staticModelsRoot, relPrefix = "static/models") {
  const objectsRoot = path.join(staticModelsRoot, "objects");
  if (!fs.existsSync(objectsRoot)) return [];
  return walkStaticModelGlbs(objectsRoot, `${relPrefix}/objects`).filter((rel) =>
    rel.startsWith(APARTMENT_DECOR_OBJECTS_PREFIX),
  );
}

/**
 * Normalize a user-supplied model path to repo-relative `static/models/...` form.
 * Accepts bare filenames, paths under objects/, or full static/models/ paths.
 */
export function normalizeModelRelPath(raw, { apartmentOnly = false } = {}) {
  const trimmed = raw.trim().replace(/^\/+/u, "").replaceAll("\\", "/");
  if (!trimmed || trimmed.includes("..")) return null;

  let rel = trimmed;
  if (!rel.startsWith("static/models/")) {
    if (rel.startsWith("objects/")) {
      rel = `static/models/${rel}`;
    } else if (apartmentOnly) {
      rel = `${APARTMENT_DECOR_OBJECTS_PREFIX}${rel}`;
    } else if (!rel.includes("/")) {
      rel = `${APARTMENT_DECOR_OBJECTS_PREFIX}${rel}`;
    } else {
      rel = `static/models/${rel}`;
    }
  }

  if (!rel.toLowerCase().endsWith(".glb")) return null;
  if (apartmentOnly && !rel.startsWith(APARTMENT_DECOR_OBJECTS_PREFIX)) return null;
  if (SKIP_MODEL_REL_PATHS.has(rel)) return null;
  return rel;
}

function shouldSkipEntirely(fullPath, beforeBytes, compressTextures) {
  if (!compressTextures) return null;
  if (!glbUsesOnlyWebpTextures(fullPath)) return null;
  if (beforeBytes < SKIP_TINY_WEBP_MAX_BYTES) return "already small with WebP textures";
  if (beforeBytes < SKIP_WEBP_MAX_BYTES) return "already WebP compressed";
  return null;
}

function willCompressTexturesForFile(fullPath, beforeBytes, compressTextures) {
  if (!compressTextures) return false;
  if (beforeBytes < TEXTURE_COMPRESS_MIN_BYTES) return false;
  return true;
}

function hasSimplifyOptions(simplifyOptions) {
  return simplifyOptions?.ratio != null || simplifyOptions?.error != null;
}

function formatSimplifyAction(simplifyOptions) {
  const parts = [];
  if (simplifyOptions.ratio != null) parts.push(`ratio=${simplifyOptions.ratio}`);
  if (simplifyOptions.error != null) parts.push(`error=${simplifyOptions.error}`);
  if (simplifyOptions.lockBorder) parts.push("lockBorder");
  return `simplify(${parts.join(", ")})`;
}

function buildSimplifyTransformOptions(simplifyOptions) {
  const opts = { simplifier: MeshoptSimplifier };
  if (simplifyOptions.ratio != null) {
    opts.ratio = simplifyOptions.ratio;
    // gltf-transform default error (0.0001) stops well before ratio target — use a loose
    // ceiling so --ratio is the binding constraint unless --error is also passed.
    if (simplifyOptions.error == null) {
      opts.error = 1;
    }
  }
  if (simplifyOptions.error != null) opts.error = simplifyOptions.error;
  if (simplifyOptions.lockBorder) opts.lockBorder = true;
  return opts;
}

export async function optimizeGlb({
  rel,
  modelsRoot,
  backupDir,
  apply,
  reorderIndices = true,
  compressTextures = false,
  simplifyOptions = null,
  fromBackup = false,
}) {
  const fullPath = path.join(modelsRoot, rel);
  const backupPath = path.join(backupDir, rel);
  if (!fs.existsSync(fullPath)) {
    return { rel, skipped: true, reason: "missing file" };
  }

  if (fromBackup && apply) {
    if (!fs.existsSync(backupPath)) {
      return { rel, skipped: true, reason: "no backup — run once without --from-backup first" };
    }
    fs.copyFileSync(backupPath, fullPath);
  }

  const beforeTris = countTrianglesInGlbFile(fullPath);
  const beforeBytes = fs.statSync(fullPath).size;
  const texSize = resolveTextureMaxSize(rel);
  const skipReason = shouldSkipEntirely(fullPath, beforeBytes, compressTextures);
  let willCompress = willCompressTexturesForFile(fullPath, beforeBytes, compressTextures);
  const willSimplify = hasSimplifyOptions(simplifyOptions);

  // WebP skip applies to texture work only — do not block simplify or meshopt reorder.
  if (skipReason) {
    willCompress = false;
  }

  if (skipReason && !willSimplify && !reorderIndices && !willCompress) {
    return { rel, skipped: true, reason: skipReason, beforeTris, beforeBytes, texSize };
  }

  if (!reorderIndices && !willCompress && !willSimplify) {
    return { rel, skipped: true, reason: "nothing to do", beforeTris, beforeBytes };
  }

  if (!apply) {
    const actions = [];
    if (fromBackup) actions.push("restore backup");
    if (willSimplify) actions.push(formatSimplifyAction(simplifyOptions));
    if (reorderIndices) actions.push("meshopt reorder");
    if (willCompress) actions.push(`webp≤${texSize}`);
    return {
      rel,
      dryRun: true,
      beforeTris,
      texSize,
      beforeKB: Math.round(beforeBytes / 1024),
      actions,
      willSimplify,
      fromBackup,
    };
  }

  if (reorderIndices) {
    await MeshoptEncoder.ready;
  }
  if (willSimplify) {
    await MeshoptSimplifier.ready;
  }

  const io = new NodeIO();
  const document = await io.read(fullPath);

  if (willSimplify) {
    await document.transform(simplify(buildSimplifyTransformOptions(simplifyOptions)));
  }

  if (reorderIndices) {
    await document.transform(reorder({ encoder: MeshoptEncoder, target: "performance" }));
  }

  if (willCompress) {
    try {
      await document.transform(
        textureCompress({
          encoder: sharp,
          targetFormat: "webp",
          resize: [texSize, texSize],
        }),
      );
    } catch (err) {
      console.warn(`WARN ${rel}: textureCompress skipped (${err.message})`);
    }
  }

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(fullPath, backupPath);
  }

  await io.write(fullPath, document);

  const afterTris = countTrianglesInGlbFile(fullPath);
  const afterBytes = fs.statSync(fullPath).size;

  return {
    rel,
    beforeTris,
    afterTris,
    beforeKB: Math.round(beforeBytes / 1024),
    afterKB: Math.round(afterBytes / 1024),
    texSize: willCompress ? texSize : undefined,
    meshOnly: !willCompress,
    simplified: willSimplify,
    triReductionPct:
      willSimplify && beforeTris > 0 ? Math.round((1 - afterTris / beforeTris) * 100) : undefined,
  };
}

export function formatGlbResultLabel(rel) {
  return rel.replace(/^static\/models\/objects\//u, "").replace(/^static\/models\//u, "");
}

export function logGlbResult(result) {
  const name = formatGlbResultLabel(result.rel);
  if (result.skipped) {
    console.log("SKIP", name, "-", result.reason);
  } else if (result.dryRun) {
    const triNote = result.willSimplify
      ? `${result.beforeTris} tris (will simplify)`
      : `${result.beforeTris} tris (unchanged)`;
    console.log("PLAN", name, triNote, result.actions.join(" + "), `${result.beforeKB} KB`);
  } else if (result.error) {
    console.error("FAIL", result.rel, result.error);
  } else {
    const triNote =
      result.afterTris === result.beforeTris
        ? `${result.beforeTris} tris (unchanged)`
        : `${result.beforeTris} → ${result.afterTris} tris`;
    const texNote = result.meshOnly ? "textures untouched" : `tex≤${result.texSize}`;
    const simplifyNote =
      result.simplified && result.triReductionPct != null ? `−${result.triReductionPct}% tris` : "";
    console.log("DONE", name, triNote, `${result.beforeKB} → ${result.afterKB} KB`, texNote, simplifyNote);
  }
}

export async function optimizeGlbList({
  relPaths,
  modelsRoot,
  backupDir,
  apply,
  reorderIndices = true,
  compressTextures = false,
}) {
  const results = [];
  for (const rel of relPaths) {
    try {
      const result = await optimizeGlb({
        rel,
        modelsRoot,
        backupDir,
        apply,
        reorderIndices,
        compressTextures,
      });
      results.push(result);
      logGlbResult(result);
    } catch (err) {
      const result = { rel, error: String(err) };
      results.push(result);
      logGlbResult(result);
    }
  }
  return results;
}

export function summarizeDryRun(results) {
  const planned = results.filter((r) => r.dryRun);
  const estSavedKB = planned.reduce((s, r) => s + r.beforeKB, 0);
  return { plannedCount: planned.length, estSavedKB };
}

/** First positional argv token (skips known flags and their values). */
export function parseModelArgFromArgv(argv) {
  const valueFlags = new Set(["--ratio", "--error"]);
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      if (valueFlags.has(arg)) i++;
      continue;
    }
    positional.push(arg);
  }
  return positional[0];
}

/** Parse `--flag value` from argv; returns undefined if flag absent or value missing. */
export function parseCliFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value == null || value.startsWith("--")) return undefined;
  return value;
}

/**
 * Parse simplify CLI flags. Requires at least one of --ratio or --error.
 * ratio: fraction of triangles to keep (0–1], e.g. 0.5 = half the triangles.
 */
export function parseSimplifyOptionsFromArgv(argv) {
  const ratioRaw = parseCliFlagValue(argv, "--ratio");
  const errorRaw = parseCliFlagValue(argv, "--error");
  const lockBorder = argv.includes("--lock-border");

  if (ratioRaw == null && errorRaw == null) {
    return null;
  }

  const simplifyOptions = {};
  if (ratioRaw != null) {
    const ratio = Number(ratioRaw);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
      throw new Error(`--ratio must be a number in (0, 1], got "${ratioRaw}"`);
    }
    simplifyOptions.ratio = ratio;
  }
  if (errorRaw != null) {
    const error = Number(errorRaw);
    if (!Number.isFinite(error) || error <= 0) {
      throw new Error(`--error must be a positive number, got "${errorRaw}"`);
    }
    simplifyOptions.error = error;
  }
  if (lockBorder) {
    simplifyOptions.lockBorder = true;
  }
  return simplifyOptions;
}

/**
 * Safe GLB optimization: meshopt index reorder (GPU locality) + WebP textures (1024–2048).
 * Does NOT decimate geometry — triangle count and silhouette stay unchanged.
 */

import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { reorder, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

/** Procedural runtime paths — skip when absent on disk. */
export const SKIP_MODEL_REL_PATHS = new Set(["static/models/objects/window-shutter.glb"]);

/** Max WebP edge length by folder. Never upscales; only downscales oversized embedded textures. */
const TEXTURE_MAX_BY_PREFIX = [
  { prefix: "static/models/players/", texSize: 2048 },
  { prefix: "static/models/npcs/", texSize: 2048 },
  { prefix: "static/models/fp/", texSize: 2048 },
  { prefix: "static/models/viewmodels/", texSize: 1024 },
  { prefix: "static/models/weapons/", texSize: 1024 },
  { prefix: "static/models/objects/", texSize: 1024 },
  { prefix: "static/models/items/", texSize: 1024 },
  { prefix: "static/models/consumables/", texSize: 1024 },
];

const DEFAULT_TEXTURE_MAX = 1024;
const TEXTURE_COMPRESS_MIN_BYTES = 500_000;
/** Tiny props that were already WebP-compressed — skip entirely on re-runs. */
const SKIP_TINY_WEBP_MAX_BYTES = 200_000;

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

/** Skip re-processing when textures are already WebP and file is post-compress size. */
const SKIP_WEBP_MAX_BYTES = 2_000_000;

function shouldSkipEntirely(fullPath, beforeBytes) {
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

export async function optimizeGlb({
  rel,
  modelsRoot,
  backupDir,
  apply,
  reorderIndices = true,
  compressTextures = true,
}) {
  const fullPath = path.join(modelsRoot, rel);
  if (!fs.existsSync(fullPath)) {
    return { rel, skipped: true, reason: "missing file" };
  }

  const beforeTris = countTrianglesInGlbFile(fullPath);
  const beforeBytes = fs.statSync(fullPath).size;
  const texSize = resolveTextureMaxSize(rel);
  const skipReason = shouldSkipEntirely(fullPath, beforeBytes);
  const willCompress = willCompressTexturesForFile(fullPath, beforeBytes, compressTextures);

  if (skipReason) {
    return { rel, skipped: true, reason: skipReason, beforeTris, beforeBytes, texSize };
  }

  if (!apply) {
    const actions = ["reorder"];
    if (willCompress) actions.push(`webp≤${texSize}`);
    return {
      rel,
      dryRun: true,
      beforeTris,
      texSize,
      beforeKB: Math.round(beforeBytes / 1024),
      actions,
    };
  }

  await MeshoptEncoder.ready;
  const io = new NodeIO();
  const document = await io.read(fullPath);

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

  const backupPath = path.join(backupDir, rel);
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
    texSize,
  };
}

export function formatGlbResultLabel(rel) {
  return rel.replace(/^static\/models\//u, "");
}

export function logGlbResult(result) {
  const name = formatGlbResultLabel(result.rel);
  if (result.skipped) {
    console.log("SKIP", name, "-", result.reason);
  } else if (result.dryRun) {
    console.log("PLAN", name, `${result.beforeTris} tris (unchanged)`, result.actions.join(" + "), `${result.beforeKB} KB`);
  } else if (result.error) {
    console.error("FAIL", result.rel, result.error);
  } else {
    console.log(
      "DONE",
      name,
      `${result.beforeTris} tris (unchanged)`,
      `${result.beforeKB} → ${result.afterKB} KB`,
      `tex≤${result.texSize}`,
    );
  }
}

export async function optimizeGlbList({ relPaths, modelsRoot, backupDir, apply }) {
  const results = [];
  for (const rel of relPaths) {
    try {
      const result = await optimizeGlb({ rel, modelsRoot, backupDir, apply });
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

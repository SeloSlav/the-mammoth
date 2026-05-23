/**
 * Meshopt index reorder for apartment decor import GLBs (static/models/objects/).
 * Does NOT touch textures, resize images, or decimate geometry.
 *
 * Excludes fp hands, viewmodels, weapons, items, consumables, players, npcs.
 *
 * Usage:
 *   node scripts/optimize-apartment-glbs.mjs           # dry-run
 *   node scripts/optimize-apartment-glbs.mjs --apply   # write optimized GLBs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APARTMENT_DECOR_OBJECTS_PREFIX,
  optimizeGlbList,
  summarizeDryRun,
  walkApartmentDecorGlbs,
} from "./lib/glb-optimize-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_ROOT = path.join(ROOT, "apps/client/public");
const STATIC_MODELS_ROOT = path.join(MODELS_ROOT, "static/models");
const BACKUP_DIR = path.join(ROOT, "content/models/glb-source-backups");

const apply = process.argv.includes("--apply");
const relPaths = walkApartmentDecorGlbs(STATIC_MODELS_ROOT);

console.log(apply ? "=== APPLY MODE ===" : "=== DRY RUN (pass --apply to write) ===");
console.log("Pipeline: meshopt index reorder only. Textures and geometry unchanged.");
console.log("Scope:", APARTMENT_DECOR_OBJECTS_PREFIX);
console.log("Static models root:", STATIC_MODELS_ROOT);
console.log("Backup dir:", BACKUP_DIR);
console.log(`Found ${relPaths.length} apartment decor GLB files`);
console.log("");

const results = await optimizeGlbList({
  relPaths,
  modelsRoot: MODELS_ROOT,
  backupDir: BACKUP_DIR,
  apply,
  reorderIndices: true,
  compressTextures: false,
});

if (!apply) {
  const { plannedCount, estSavedKB } = summarizeDryRun(results);
  console.log("");
  console.log(`Would process ${plannedCount} files (${estSavedKB.toLocaleString()} KB total on disk).`);
  console.log("Re-run with --apply to write. Originals backed up to content/models/glb-source-backups/");
}

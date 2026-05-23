/**
 * Reorder mesh indices (meshoptimizer) + WebP texture compression for all GLBs
 * under apps/client/public/static/models/. No geometry decimation.
 *
 * Usage:
 *   node scripts/optimize-glbs.mjs           # dry-run
 *   node scripts/optimize-glbs.mjs --apply   # write optimized GLBs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimizeGlbList, summarizeDryRun, walkStaticModelGlbs } from "./lib/glb-optimize-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_ROOT = path.join(ROOT, "apps/client/public");
const STATIC_MODELS_ROOT = path.join(MODELS_ROOT, "static/models");
const BACKUP_DIR = path.join(ROOT, "content/models/glb-source-backups");

const apply = process.argv.includes("--apply");
const relPaths = walkStaticModelGlbs(STATIC_MODELS_ROOT);

console.log(apply ? "=== APPLY MODE ===" : "=== DRY RUN (pass --apply to write) ===");
console.log("Pipeline: meshopt reorder + WebP textures (1024–2048). No decimation.");
console.log("Static models root:", STATIC_MODELS_ROOT);
console.log("Backup dir:", BACKUP_DIR);
console.log(`Found ${relPaths.length} GLB files`);
console.log("");

const results = await optimizeGlbList({
  relPaths,
  modelsRoot: MODELS_ROOT,
  backupDir: BACKUP_DIR,
  apply,
});

if (!apply) {
  const { plannedCount, estSavedKB } = summarizeDryRun(results);
  console.log("");
  console.log(`Would process ${plannedCount} files (~${estSavedKB.toLocaleString()} KB source before compress).`);
  console.log("Re-run with --apply to write. Originals backed up to content/models/glb-source-backups/");
}

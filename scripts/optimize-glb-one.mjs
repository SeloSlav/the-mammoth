/**
 * Meshopt reorder and/or simplify for a single GLB — for iterative testing.
 * Textures are never touched.
 *
 * Usage:
 *   node scripts/optimize-glb-one.mjs fish-tank.glb
 *   node scripts/optimize-glb-one.mjs fish-tank.glb --apply
 *   node scripts/optimize-glb-one.mjs grow-tray-empty.glb --from-backup --ratio 0.5 --apply
 *   node scripts/optimize-glb-one.mjs grow-tray-empty.glb --from-backup --ratio 0.5 --error 0.01 --apply
 *
 * Simplify flags:
 *   --ratio <0-1>   fraction of triangles to keep (0.5 = half); uses loose error unless --error set
 *   --error <n>     max geometric error (higher = more aggressive)
 *   --lock-border   preserve open mesh borders during simplify
 *   --from-backup   restore pre-optimization original before running (best for iteration)
 *
 * By default only apartment decor paths (static/models/objects/) are accepted.
 * Pass --any-model to allow other static/models/ paths (weapons, viewmodels, etc.).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APARTMENT_DECOR_OBJECTS_PREFIX,
  normalizeModelRelPath,
  optimizeGlb,
  logGlbResult,
  parseSimplifyOptionsFromArgv,
  parseModelArgFromArgv,
} from "./lib/glb-optimize-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_ROOT = path.join(ROOT, "apps/client/public");
const BACKUP_DIR = path.join(ROOT, "content/models/glb-source-backups");

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const anyModel = argv.includes("--any-model");
const fromBackup = argv.includes("--from-backup");
const modelArg = parseModelArgFromArgv(argv);

let simplifyOptions = null;
try {
  simplifyOptions = parseSimplifyOptionsFromArgv(argv);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

if (!modelArg) {
  console.error("Usage: node scripts/optimize-glb-one.mjs <model.glb> [options]");
  console.error("");
  console.error("Options:");
  console.error("  --apply              write optimized GLB");
  console.error("  --from-backup        restore backup before processing");
  console.error("  --ratio <0-1>        keep this fraction of triangles (e.g. 0.5)");
  console.error("  --error <n>          max simplify error (higher = more aggressive)");
  console.error("  --lock-border        preserve mesh borders during simplify");
  console.error("  --any-model          allow paths outside static/models/objects/");
  console.error("");
  console.error("Examples:");
  console.error("  node scripts/optimize-glb-one.mjs fish-tank.glb --apply");
  console.error("  node scripts/optimize-glb-one.mjs grow-tray-empty.glb --from-backup --ratio 0.5 --apply");
  console.error("  node scripts/optimize-glb-one.mjs grow-tray-empty.glb --from-backup --ratio 0.3 --error 0.02 --apply");
  process.exit(1);
}

const rel = normalizeModelRelPath(modelArg, { apartmentOnly: !anyModel });
if (!rel) {
  console.error(`Invalid model path: ${modelArg}`);
  if (!anyModel) {
    console.error(`Expected a path under ${APARTMENT_DECOR_OBJECTS_PREFIX} (or pass --any-model).`);
  }
  process.exit(1);
}

const fullPath = path.join(MODELS_ROOT, rel);
const pipelineParts = [];
if (fromBackup) pipelineParts.push("restore backup");
if (simplifyOptions) pipelineParts.push("meshopt simplify");
pipelineParts.push("meshopt reorder");
pipelineParts.push("textures unchanged");

console.log(apply ? "=== APPLY MODE ===" : "=== DRY RUN (pass --apply to write) ===");
console.log("Pipeline:", pipelineParts.join(" → "));
console.log("Model:", rel);
console.log("Full path:", fullPath);
console.log("Backup dir:", BACKUP_DIR);
console.log("");

const result = await optimizeGlb({
  rel,
  modelsRoot: MODELS_ROOT,
  backupDir: BACKUP_DIR,
  apply,
  reorderIndices: true,
  compressTextures: false,
  simplifyOptions,
  fromBackup,
});

logGlbResult(result);

if (result.error) {
  process.exit(1);
}

if (!apply && !result.skipped) {
  console.log("");
  console.log("Re-run with --apply to write. Original backed up on first apply.");
  if (simplifyOptions) {
    console.log("Tip: use --from-backup --apply to retry from the original without compounding.");
  }
}

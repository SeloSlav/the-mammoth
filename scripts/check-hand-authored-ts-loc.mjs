#!/usr/bin/env node
/**
 * Warn (or with `--strict`, fail) when hand-authored TS/TSX under src/ exceeds a line budget.
 * Generated / vendored paths are excluded via ALLOWLIST_GLOBS-style path checks.
 */
import fs from "node:fs";
import path from "node:path";

const MAX_LINES = 1000;
const ROOT = path.resolve(import.meta.dirname, "..");

const SOURCE_ROOTS = ["packages", "apps"].map((d) => path.join(ROOT, d));

/** Substrings; if the normalized file path includes any, the file is skipped. */
const SKIP_SUBSTRINGS = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}dist${path.sep}`,
  `${path.sep}build${path.sep}`,
  "generatedCollisionArtifacts.ts",
  `${path.sep}module_bindings${path.sep}`,
];

const extensions = new Set([".ts", ".tsx"]);

function* walkDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkDir(full);
    else if (e.isFile()) yield full;
  }
}

function shouldSkip(absPath) {
  const rel = path.relative(ROOT, absPath).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) return true;
  const norm = absPath.replace(/\\/g, "/");
  return SKIP_SUBSTRINGS.some((s) => norm.includes(s.replace(/\//g, path.sep)));
}

const strict = process.argv.includes("--strict");
const offenders = [];

for (const base of SOURCE_ROOTS) {
  if (!fs.existsSync(base)) continue;
  for (const pkg of fs.readdirSync(base, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const srcDir = path.join(base, pkg.name, "src");
    if (!fs.existsSync(srcDir)) continue;
    for (const file of walkDir(srcDir)) {
      if (!extensions.has(path.extname(file))) continue;
      if (shouldSkip(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      const lines = text.split(/\r\n|\r|\n/).length;
      if (lines > MAX_LINES) {
        offenders.push({ file: path.relative(ROOT, file), lines });
      }
    }
  }
}

offenders.sort((a, b) => b.lines - a.lines);

if (offenders.length === 0) {
  console.log(`check-hand-authored-ts-loc: ok (no files over ${MAX_LINES} lines).`);
  process.exit(0);
}

const msg = [
  `check-hand-authored-ts-loc: ${offenders.length} file(s) exceed ${MAX_LINES} lines:`,
  ...offenders.map((o) => `  ${o.lines}\t${o.file}`),
  `Run with smaller modules or add an explicit exclusion in ${path.relative(process.cwd(), import.meta.filename)} only for generated/vendored code.`,
].join("\n");

if (strict) {
  console.error(msg);
  process.exit(1);
}
console.warn(msg);
process.exit(0);

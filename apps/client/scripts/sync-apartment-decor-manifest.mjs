/**
 * Generates `public/static/models/objects/index.json` from the contents of
 * `public/static/models/objects/**` so clients (e.g. decor catalog fetchers) can offer a
 * clickable model list without hardcoding filenames in the bundle.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const objectsRoot = join(clientRoot, "public", "static", "models", "objects");
const manifestPath = join(objectsRoot, "index.json");
const supportedExtensions = new Set([".glb", ".obj"]);

function toPosixPath(path) {
  return path.replaceAll("\\", "/");
}

function walkFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === "index.json") continue;
    const ext = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
    if (!supportedExtensions.has(ext)) continue;
    out.push(abs);
  }
}

mkdirSync(objectsRoot, { recursive: true });

const modelAbsPaths = [];
walkFiles(objectsRoot, modelAbsPaths);

const manifestEntries = modelAbsPaths
  .filter((abs) => statSync(abs).isFile())
  .map((abs) => `static/models/objects/${toPosixPath(relative(objectsRoot, abs))}`)
  .sort((a, b) => a.localeCompare(b));

writeFileSync(manifestPath, `${JSON.stringify(manifestEntries, null, 2)}\n`, "utf8");
console.log(
  `[sync-apartment-decor-manifest] Wrote ${manifestEntries.length} model entr${
    manifestEntries.length === 1 ? "y" : "ies"
  } to ${manifestPath}`,
);

import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const SUPPORTED_EXTENSIONS = new Set([".glb", ".obj"]);

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
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    out.push(abs);
  }
}

/**
 * Scan `apps/client/public/static/models/objects/**` and write `index.json`.
 *
 * @param {string} repoRoot Absolute repo root.
 * @returns {{ entryCount: number; manifestPath: string; manifestEntries: string[] }}
 */
export function syncApartmentDecorManifestFromRepoRoot(repoRoot) {
  const objectsRoot = join(repoRoot, "apps/client/public/static/models/objects");
  const manifestPath = join(objectsRoot, "index.json");

  mkdirSync(objectsRoot, { recursive: true });

  const modelAbsPaths = [];
  walkFiles(objectsRoot, modelAbsPaths);

  const manifestEntries = modelAbsPaths
    .filter((abs) => statSync(abs).isFile())
    .map((abs) => `static/models/objects/${toPosixPath(relative(objectsRoot, abs))}`)
    .sort((a, b) => a.localeCompare(b));

  writeFileSync(manifestPath, `${JSON.stringify(manifestEntries, null, 2)}\n`, "utf8");

  return { entryCount: manifestEntries.length, manifestPath, manifestEntries };
}

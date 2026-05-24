/**
 * Generates `public/static/models/objects/index.json` from the contents of
 * `public/static/models/objects/**` so clients (e.g. decor catalog fetchers) can offer a
 * clickable model list without hardcoding filenames in the bundle.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncApartmentDecorManifestFromRepoRoot } from "../../../scripts/lib/sync-apartment-decor-manifest-core.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const { entryCount, manifestPath } = syncApartmentDecorManifestFromRepoRoot(repoRoot);
console.log(
  `[sync-apartment-decor-manifest] Wrote ${entryCount} model entr${
    entryCount === 1 ? "y" : "ies"
  } to ${manifestPath}`,
);

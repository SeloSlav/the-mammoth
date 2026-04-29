/**
 * Copies Khronos Basis Universal transcoder payloads from the installed `three` package into
 * `public/basis/` so KTX2Loader can fetch `/basis/*` at runtime. Re-run via `pnpm sync:basis-transcoder`
 * or automatically on `pnpm install` (postinstall).
 *
 * Preserves `public/basis/README.txt` (no file of that name ships in three's `libs/basis`).
 */
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** `three`'s package root (exports block hides `package.json` from resolver). */
function resolveThreeBasisDir() {
  let dir = dirname(require.resolve("three"));
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, "examples", "jsm", "libs", "basis");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const basisSrc = resolveThreeBasisDir();
const clientRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const basisDest = join(clientRoot, "public", "basis");

if (!basisSrc || !existsSync(basisSrc)) {
  console.warn("[sync-basis-transcoder] Missing libs/basis under three (pnpm install?):", basisSrc);
  process.exit(0);
}

mkdirSync(basisDest, { recursive: true });
let n = 0;
for (const name of readdirSync(basisSrc)) {
  cpSync(join(basisSrc, name), join(basisDest, name), { recursive: true, force: true });
  n++;
}
console.log(`[sync-basis-transcoder] Synced ${n} Basis file(s) from three → ${basisDest}`);

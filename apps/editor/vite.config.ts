import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { Connect } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { prependConnectMiddleware } from "./src/vite/prependConnectMiddleware";

const repoRoot = path.resolve(__dirname, "../..");
const clientPublicRoot = path.resolve(repoRoot, "apps/client/public");

const require = createRequire(import.meta.url);
const threeWebgpu = require.resolve("three/webgpu");

function staticMime(filePath: string): string {
  if (filePath.endsWith(".glb")) return "model/gltf-binary";
  if (filePath.endsWith(".gltf")) return "model/gltf+json";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

/** Serves `apps/client/public/**` at `/…` so FP GLB paths match the gameplay client (`/static/...`). */
function editorClientPublicStaticMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url?.split("?")[0] ?? "";
    if (!url.startsWith("/static/") && !url.startsWith("/audio/")) return next();
    const rel = decodeURIComponent(url.replace(/^\//, ""));
    const abs = path.resolve(clientPublicRoot, rel);
    const relSafe = path.relative(clientPublicRoot, abs);
    if (relSafe.startsWith("..") || path.isAbsolute(relSafe)) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    try {
      const data = await fs.readFile(abs);
      res.setHeader("Content-Type", staticMime(abs));
      res.statusCode = 200;
      res.end(data);
    } catch {
      /**
       * Do **not** `next()` into Vite’s SPA fallback — that returns `index.html` (200) and
       * `GLTFLoader` dies on `JSON.parse` with “Unexpected token '<'”.
       */
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`Missing static asset: /${rel} (expected under apps/client/public/)`);
    }
  };
}

export default defineConfig({
  plugins: [
    /**
     * `configureServer` + `order: "pre"` is not always enough: Vite’s own middleware can still sit
     * earlier in Connect’s stack. We **prepend** so editor `/content` + `/__editor` handlers run
     * before transforms / SPA fallback (fixes `POST /__editor/save-landing-kit` → 404).
     */
    {
      name: "editor-dev-content",
      configureServer: {
        order: "pre",
        /**
         * Lazy import keeps `vite.config` surface small; dev server is started with
         * `node --import tsx` (see `package.json`) so workspace `.ts` packages resolve
         * TypeScript-style `.js` import specifiers when Vite’s config bundle loads them as externals.
         */
        async handler(server) {
          const { editorDevMiddleware } = await import("./src/vite/editorDevMiddleware");
          prependConnectMiddleware(
            server.middlewares,
            editorDevMiddleware(repoRoot, { viteBase: server.config.base }),
          );
          prependConnectMiddleware(server.middlewares, editorClientPublicStaticMiddleware());
        },
      },
      configurePreviewServer: {
        order: "pre",
        async handler(server) {
          const { editorDevMiddleware } = await import("./src/vite/editorDevMiddleware");
          prependConnectMiddleware(
            server.middlewares,
            editorDevMiddleware(repoRoot, { viteBase: server.config.base }),
          );
          prependConnectMiddleware(server.middlewares, editorClientPublicStaticMiddleware());
        },
      },
    },
    react(),
    checker({ typescript: { tsconfigPath: "tsconfig.json" } }),
  ],
  server: {
    port: 5174,
    /** Fail fast if 5174 is taken so the app URL always matches `pnpm editor:dev` / docs (no silent5175 +404 confusion). */
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
  resolve: {
    alias: [{ find: /^three$/, replacement: threeWebgpu }],
  },
});

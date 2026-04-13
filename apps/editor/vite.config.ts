import fs from "node:fs/promises";
import path from "node:path";
import type { Connect } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { editorDevMiddleware } from "./src/vite/editorDevMiddleware";

const repoRoot = path.resolve(__dirname, "../..");
const clientPublicRoot = path.resolve(repoRoot, "apps/client/public");

function staticMime(filePath: string): string {
  if (filePath.endsWith(".glb")) return "model/gltf-binary";
  if (filePath.endsWith(".gltf")) return "model/gltf+json";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
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
    react(),
    checker({ typescript: { tsconfigPath: "tsconfig.json" } }),
    {
      name: "editor-dev-content",
      configureServer(server) {
        server.middlewares.use(editorClientPublicStaticMiddleware());
        server.middlewares.use(editorDevMiddleware(repoRoot));
      },
      configurePreviewServer(server) {
        server.middlewares.use(editorClientPublicStaticMiddleware());
      },
    },
  ],
  server: {
    port: 5174,
    /** If another editor instance holds 5174, pick the next free port instead of exiting. */
    strictPort: false,
    fs: { allow: [repoRoot] },
  },
});

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { devStaticModelMiddleware } from "../client/src/vite/devStaticModelMiddleware";
import { editorDevMiddleware } from "./src/vite/editorDevMiddleware";
import { prependConnectMiddleware } from "./src/vite/prependConnectMiddleware";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "../..");
const clientPublicRoot = path.resolve(repoRoot, "apps/client/public");
const clientSrc = path.resolve(repoRoot, "apps/client/src");
const uiThemeSrc = path.resolve(repoRoot, "packages/ui-theme/src");
const spacetimeClientSrc = path.resolve(repoRoot, "packages/spacetime-client/src/index.ts");

const require = createRequire(import.meta.url);
const threeWebgpu = require.resolve("three/webgpu");

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
        async handler(server) {
          prependConnectMiddleware(
            server.middlewares,
            editorDevMiddleware(repoRoot, { viteBase: server.config.base }),
          );
          prependConnectMiddleware(
            server.middlewares,
            devStaticModelMiddleware({ clientPublicRoot }),
          );
        },
      },
      configurePreviewServer: {
        order: "pre",
        async handler(server) {
          prependConnectMiddleware(
            server.middlewares,
            editorDevMiddleware(repoRoot, { viteBase: server.config.base }),
          );
          prependConnectMiddleware(
            server.middlewares,
            devStaticModelMiddleware({ clientPublicRoot }),
          );
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
    alias: [
      { find: /^three$/, replacement: threeWebgpu },
      { find: "@the-mammoth/client", replacement: clientSrc },
      {
        find: /^@the-mammoth\/ui-theme\/uiTheme\.css$/,
        replacement: path.join(uiThemeSrc, "uiTheme.css"),
      },
      {
        find: /^@the-mammoth\/ui-theme$/,
        replacement: path.join(uiThemeSrc, "index.ts"),
      },
      {
        find: /^@the-mammoth\/spacetime-client$/,
        replacement: spacetimeClientSrc,
      },
    ],
  },
  optimizeDeps: {
    exclude: ["@the-mammoth/world", "@the-mammoth/ui-theme"],
  },
});

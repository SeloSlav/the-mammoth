/// <reference types="vitest/config" />
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { mammothGameClientSocialMetaHead } from "../../packages/ui-theme/src/mammothSiteMeta";
import { contentDevStaticGetMiddleware } from "./src/vite/contentDevMiddleware.js";
import { devStaticModelMiddleware } from "./src/vite/devStaticModelMiddleware.js";
import { prependConnectMiddleware } from "./src/vite/prependConnectMiddleware.js";

const clientPublicRoot = path.resolve(__dirname, "public");

/**
 * Vite’s default watcher can miss edits under pnpm’s symlinked `node_modules` layout (especially on
 * Windows). `@the-mammoth/world` ships as `./src/*.ts` — register the real directory so stair/shaft
 * mesh changes always trigger a reload without guessing whether HMR picked up the workspace.
 */
function watchWorkspaceWorldSrc(): Plugin {
  const worldSrc = path.resolve(__dirname, "../../packages/world/src");
  return {
    name: "watch-workspace-world-src",
    configureServer(server) {
      server.watcher.add(worldSrc);
    },
  };
}

function watchWorkspaceUiThemeSrc(): Plugin {
  const dir = path.resolve(__dirname, "../../packages/ui-theme/src");
  return {
    name: "watch-workspace-ui-theme-src",
    configureServer(server) {
      server.watcher.add(dir);
    },
  };
}

const repoRoot = path.resolve(__dirname, "../..");
const uiThemeSrc = path.resolve(repoRoot, "packages/ui-theme/src");
const assetsSrc = path.resolve(repoRoot, "packages/assets/src/index.ts");
const engineSrc = path.resolve(repoRoot, "packages/engine/src/index.ts");
const worldSrc = path.resolve(repoRoot, "packages/world/src/index.ts");
const gameSrc = path.resolve(repoRoot, "packages/game/src/index.ts");
const spacetimeClientSrc = path.resolve(repoRoot, "packages/spacetime-client/src/index.ts");

const require = createRequire(import.meta.url);
/** Resolved path to `build/three.webgpu.js` via package export `three/webgpu`. */
const threeWebgpu = require.resolve("three/webgpu");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const siteOrigin = (env.VITE_SITE_ORIGIN ?? "http://localhost:5173").replace(/\/+$/, "");
  const socialMetaBlock = mammothGameClientSocialMetaHead(siteOrigin);

  return {
    plugins: [
      watchWorkspaceWorldSrc(),
      watchWorkspaceUiThemeSrc(),
      {
        name: "content-dev-static-get",
        configureServer: {
          order: "pre",
          handler(server) {
            prependConnectMiddleware(
              server.middlewares,
              devStaticModelMiddleware({ clientPublicRoot }),
            );
            server.middlewares.use(contentDevStaticGetMiddleware(repoRoot));
          },
        },
      },
      {
        name: "mammoth-inject-social-meta",
        transformIndexHtml(html) {
          return html.replace("<!-- mammoth:injected-social-meta -->", socialMetaBlock);
        },
      },
      react(),
      checker({ typescript: { tsconfigPath: "tsconfig.json" } }),
    ],
    server: {
      port: 5173,
      /** Avoid silently using 5174+ when 5173 is taken (easy to confuse with the editor). */
      strictPort: true,
      fs: { allow: [path.resolve(__dirname, "../..")] },
    },
    resolve: {
      alias: [
        /** Runtime + types: use the WebGPU Three build only (no `three.module.js` + `three.webgpu.js` in one bundle). */
        { find: /^three$/, replacement: threeWebgpu },
        /** Explicit paths: avoids dev-server resolve failures when pnpm symlinks are missing or stale. */
        {
          find: /^@the-mammoth\/game$/,
          replacement: gameSrc,
        },
        {
          find: /^@the-mammoth\/assets$/,
          replacement: assetsSrc,
        },
        {
          find: /^@the-mammoth\/engine$/,
          replacement: engineSrc,
        },
        {
          find: /^@the-mammoth\/world$/,
          replacement: worldSrc,
        },
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
        { find: "@", replacement: path.resolve(__dirname, "src") },
      ],
    },
    // Linked workspace packages: skip pre-bundle so edits resolve from packages/{name}/src.
    optimizeDeps: {
      exclude: [
        "@the-mammoth/assets",
        "@the-mammoth/engine",
        "@the-mammoth/world",
        "@the-mammoth/ui-theme",
        "@the-mammoth/game",
      ],
    },
    test: {
      environment: "node",
    },
  };
});

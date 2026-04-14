/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { contentDevStaticGetMiddleware } from "./src/vite/contentDevMiddleware.js";

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

export default defineConfig({
  plugins: [
    watchWorkspaceWorldSrc(),
    watchWorkspaceUiThemeSrc(),
    {
      name: "content-dev-static-get",
      configureServer(server) {
        server.middlewares.use(contentDevStaticGetMiddleware(repoRoot));
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
      /** Explicit paths: avoids dev-server resolve failures when pnpm symlinks are missing or stale. */
      {
        find: /^@the-mammoth\/ui-theme\/uiTheme\.css$/,
        replacement: path.join(uiThemeSrc, "uiTheme.css"),
      },
      {
        find: /^@the-mammoth\/ui-theme$/,
        replacement: path.join(uiThemeSrc, "index.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  // Linked workspace packages: skip pre-bundle so edits resolve from packages/{name}/src.
  optimizeDeps: {
    exclude: ["@the-mammoth/world", "@the-mammoth/ui-theme"],
  },
  test: {
    environment: "node",
  },
});

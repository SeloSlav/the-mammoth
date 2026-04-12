/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";

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

export default defineConfig({
  plugins: [
    watchWorkspaceWorldSrc(),
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
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  /** Linked workspace package: skip dep pre-bundle so edits always resolve from `packages/world/src`. */
  optimizeDeps: {
    exclude: ["@the-mammoth/world"],
  },
  test: {
    environment: "node",
  },
});

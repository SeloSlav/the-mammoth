import { createRequire } from "node:module";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);

/** Avoid broken `@types/three` export maps when running codegen via `vite-node`. */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^three\/webgpu$/, replacement: require.resolve("three/webgpu") },
      { find: /^three$/, replacement: require.resolve("three") },
    ],
  },
});

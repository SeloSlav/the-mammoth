import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const threeWebgpu = require.resolve("three/webgpu");

export default defineConfig({
  resolve: {
    alias: [{ find: /^three$/, replacement: threeWebgpu }],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";

export default defineConfig({
  plugins: [
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
  test: {
    environment: "node",
  },
});

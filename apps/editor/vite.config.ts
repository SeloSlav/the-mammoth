import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { editorDevMiddleware } from "./src/vite/editorDevMiddleware";

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [
    react(),
    checker({ typescript: { tsconfigPath: "tsconfig.json" } }),
    {
      name: "editor-dev-content",
      configureServer(server) {
        server.middlewares.use(editorDevMiddleware(repoRoot));
      },
    },
  ],
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
});

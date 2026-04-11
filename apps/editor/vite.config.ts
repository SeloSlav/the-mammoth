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
    port: 5174,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, "../..")] },
  },
});

import { viteReactConfig } from "@repo/eslint-config/vite-react";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...viteReactConfig,
  { ignores: ["dist", "src/module_bindings"] },
];

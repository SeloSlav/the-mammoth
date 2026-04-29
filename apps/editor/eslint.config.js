import { viteReactConfig } from "@repo/eslint-config/vite-react";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...viteReactConfig,
  { ignores: ["dist"] },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "max-lines": ["warn", { max: 900, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["src/ui/EditorChrome.tsx", "src/state/editorStore.ts"],
    rules: {
      "max-lines": ["warn", { max: 1200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["src/editor/editorScene/editorSceneRuntime.ts"],
    rules: {
      "max-lines": ["warn", { max: 2500, skipBlankLines: true, skipComments: true }],
    },
  },
];

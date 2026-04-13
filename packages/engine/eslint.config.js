import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    files: ["src/**/*.ts"],
    rules: {
      "max-lines": ["warn", { max: 900, skipBlankLines: true, skipComments: true }],
    },
  },
];

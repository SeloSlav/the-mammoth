import { describe, expect, it } from "vitest";
import { MAMMOTH_AUTH_PASSWORD_SHELL_CSS } from "./authPasswordShellCss.js";
import { THEME_ACCENT, uiRootStyleBlock } from "./uiTheme.js";

describe("@the-mammoth/ui-theme", () => {
  it("emits :root variables containing the accent token", () => {
    const block = uiRootStyleBlock();
    expect(block).toContain(":root");
    expect(block).toContain(THEME_ACCENT);
    expect(block).toContain("--ui-accent:");
  });

  it("ships auth shell CSS with variables and body rules", () => {
    expect(MAMMOTH_AUTH_PASSWORD_SHELL_CSS).toContain("--ui-accent:");
    expect(MAMMOTH_AUTH_PASSWORD_SHELL_CSS).toContain("body {");
    expect(MAMMOTH_AUTH_PASSWORD_SHELL_CSS).toContain(".container");
  });
});

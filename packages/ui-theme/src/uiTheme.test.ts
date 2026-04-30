import { describe, expect, it } from "vitest";
import { MAMMOTH_AUTH_PASSWORD_SHELL_CSS } from "./authPasswordShellCss.js";
import { mammothGameClientSocialMetaHead } from "./mammothSiteMeta.js";
import { THEME_ACCENT, uiRootStyleBlock } from "./uiTheme.js";

describe("@the-mammoth/ui-theme", () => {
  it("emits :root variables containing the accent token", () => {
    const block = uiRootStyleBlock();
    expect(block).toContain(":root");
    expect(block).toContain(THEME_ACCENT);
    expect(block).toContain("--ui-accent:");
    expect(block).toContain("--ui-chat-name-self:");
    expect(block).toContain("--ui-chat-name-peer:");
  });

  it("ships auth shell CSS with variables and body rules", () => {
    expect(MAMMOTH_AUTH_PASSWORD_SHELL_CSS).toContain("--ui-accent:");
    expect(MAMMOTH_AUTH_PASSWORD_SHELL_CSS).toContain("body {");
    expect(MAMMOTH_AUTH_PASSWORD_SHELL_CSS).toContain(".container");
    expect(MAMMOTH_AUTH_PASSWORD_SHELL_CSS).toContain(".mammoth-logo-full");
  });

  it("emits Open Graph + Twitter tags for the game client shell", () => {
    const head = mammothGameClientSocialMetaHead("https://play.example.com");
    expect(head).toContain('property="og:image"');
    expect(head).toContain("https://play.example.com/og-social.jpg");
    expect(head).toContain('name="twitter:card"');
  });
});

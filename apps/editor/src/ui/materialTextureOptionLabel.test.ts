import { describe, expect, it } from "vitest";
import { materialTextureOptionLabel } from "./materialTextureOptionLabel.js";

describe("materialTextureOptionLabel", () => {
  it("formats known material URLs into readable labels", () => {
    expect(materialTextureOptionLabel("/static/materials/stairwell/mammoth-worn-stair-landing.svg")).toBe(
      "Mammoth Worn Stair Landing (Stairwell)",
    );
    expect(materialTextureOptionLabel("/static/materials/corridor-door/brushed-frame.jpg")).toBe(
      "Brushed Frame (Corridor Door)",
    );
  });

  it("includes nested folders in the label context", () => {
    expect(materialTextureOptionLabel("/static/materials/shared/stone/polished-concrete.webp")).toBe(
      "Polished Concrete (Shared / Stone)",
    );
  });

  it("falls back to the raw URL outside the authored materials tree", () => {
    expect(materialTextureOptionLabel("https://example.com/texture.png")).toBe(
      "https://example.com/texture.png",
    );
  });
});

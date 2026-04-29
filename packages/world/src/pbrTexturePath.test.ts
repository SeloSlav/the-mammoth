import { describe, expect, it } from "vitest";
import { textureCandidatesFromSpec } from "./pbrTexturePath.js";

describe("textureCandidatesFromSpec", () => {
  it("expands extensionless paths in ktx2-first order", () => {
    expect(textureCandidatesFromSpec("/static/a/concrete/basecolor")).toEqual([
      "/static/a/concrete/basecolor.ktx2",
      "/static/a/concrete/basecolor.webp",
      "/static/a/concrete/basecolor.png",
      "/static/a/concrete/basecolor.jpg",
      "/static/a/concrete/basecolor.jpeg",
    ]);
  });

  it("keeps a single explicit .png", () => {
    expect(textureCandidatesFromSpec("/static/a/x.png")).toEqual(["/static/a/x.png"]);
  });
});

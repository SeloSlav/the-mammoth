import { describe, expect, it } from "vitest";
import { inferPbrCompanionMapsFromBaseMapUrl } from "./inferPbrCompanionTextureUrls";

describe("inferPbrCompanionMapsFromBaseMapUrl", () => {
  it("finds sibling maps by stem suffix in the same folder", () => {
    const catalog = [
      "/static/materials/shared/brick-wall.webp",
      "/static/materials/shared/brick-wall-normal.webp",
      "/static/materials/shared/brick-wall-roughness.webp",
      "/static/materials/shared/other.svg",
    ];
    expect(
      inferPbrCompanionMapsFromBaseMapUrl("/static/materials/shared/brick-wall.webp", catalog),
    ).toEqual({
      normalMapUrl: "/static/materials/shared/brick-wall-normal.webp",
      roughnessMapUrl: "/static/materials/shared/brick-wall-roughness.webp",
      metalnessMapUrl: undefined,
      bumpMapUrl: undefined,
    });
  });

  it("strips common base-color suffixes before matching companions", () => {
    const catalog = [
      "/static/materials/x/foo-basecolor.svg",
      "/static/materials/x/foo-normal.svg",
    ];
    expect(inferPbrCompanionMapsFromBaseMapUrl("/static/materials/x/foo-basecolor.svg", catalog)).toEqual({
      normalMapUrl: "/static/materials/x/foo-normal.svg",
      roughnessMapUrl: undefined,
      metalnessMapUrl: undefined,
      bumpMapUrl: undefined,
    });
  });
});

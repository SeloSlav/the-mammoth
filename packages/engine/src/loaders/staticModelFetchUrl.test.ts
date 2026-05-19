import { describe, expect, it } from "vitest";
import { resolveStaticModelFetchUrl } from "./staticModelFetchUrl.js";

describe("resolveStaticModelFetchUrl", () => {
  it("returns path unchanged outside dev", async () => {
    const prev = import.meta.env.DEV;
    (import.meta.env as { DEV: boolean }).DEV = false;
    await expect(
      resolveStaticModelFetchUrl("static/models/objects/wardrobe-closet.glb"),
    ).resolves.toBe("/static/models/objects/wardrobe-closet.glb");
    (import.meta.env as { DEV: boolean }).DEV = prev;
  });
});

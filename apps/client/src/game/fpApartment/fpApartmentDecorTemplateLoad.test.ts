import { describe, expect, it } from "vitest";
import { collectApartmentDecorTemplateRequests } from "./fpApartmentDecorTemplateLoad.js";

describe("collectApartmentDecorTemplateRequests", () => {
  it("dedupes model paths before resolving fetch URLs", async () => {
    const requests = await collectApartmentDecorTemplateRequests([
      { modelRelPath: "static/models/objects/chair.glb" },
      { modelRelPath: "static/models/objects/chair.glb" },
      { modelRelPath: "static/models/objects/window-shutter.glb" },
    ]);

    expect(requests).toHaveLength(2);
    expect(requests.some((r) => r.modelRelPath.endsWith("chair.glb"))).toBe(true);
    expect(requests.some((r) => r.modelRelPath.endsWith("window-shutter.glb"))).toBe(true);
  });
});

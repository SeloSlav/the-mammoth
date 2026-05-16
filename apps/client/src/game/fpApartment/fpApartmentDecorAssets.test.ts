import { describe, expect, it } from "vitest";
import { normalizeApartmentDecorModelRelPath } from "./fpApartmentDecorAssets.js";

describe("normalizeApartmentDecorModelRelPath", () => {
  it("prepends static/models for bare objects/ path", () => {
    expect(normalizeApartmentDecorModelRelPath("objects/chair.glb")).toBe(
      "static/models/objects/chair.glb",
    );
  });

  it("accepts obj decor paths", () => {
    expect(normalizeApartmentDecorModelRelPath("objects/chair.obj")).toBe(
      "static/models/objects/chair.obj",
    );
  });

  it("keeps explicit static/models prefix", () => {
    expect(normalizeApartmentDecorModelRelPath("static/models/objects/chair.glb")).toBe(
      "static/models/objects/chair.glb",
    );
  });

  it("rejects ..", () => {
    expect(normalizeApartmentDecorModelRelPath("static/models/../x.glb")).toBeNull();
  });

  it("rejects unsupported mesh formats", () => {
    expect(normalizeApartmentDecorModelRelPath("objects/chair.fbx")).toBeNull();
  });
});

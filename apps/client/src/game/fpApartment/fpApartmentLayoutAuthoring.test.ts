import { describe, expect, it } from "vitest";
import { normalizeApartmentDecorModelRelPath } from "./fpApartmentLayoutAuthoring.js";

describe("normalizeApartmentDecorModelRelPath", () => {
  it("prepends static/models for bare objects/ path", () => {
    expect(normalizeApartmentDecorModelRelPath("objects/chair.glb")).toBe(
      "static/models/objects/chair.glb",
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
});

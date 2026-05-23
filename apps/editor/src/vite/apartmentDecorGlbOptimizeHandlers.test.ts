import { describe, expect, it } from "vitest";
import { resolveApartmentDecorGlbOptimizeOptions } from "./apartmentDecorGlbOptimizeHandlers.js";

describe("resolveApartmentDecorGlbOptimizeOptions", () => {
  it("accepts bare catalog filenames under objects/", () => {
    const parsed = resolveApartmentDecorGlbOptimizeOptions({
      modelRelPath: "drying-rack-2.glb",
      ratio: 0.5,
    });
    expect(parsed).toEqual({
      rel: "static/models/objects/drying-rack-2.glb",
      simplifyOptions: { ratio: 0.5 },
      compressTextures: false,
      fromBackup: false,
    });
  });

  it("treats ratio 1 as reorder-only", () => {
    const parsed = resolveApartmentDecorGlbOptimizeOptions({
      modelRelPath: "static/models/objects/rug-floor.glb",
      ratio: 1,
    });
    expect(parsed).toEqual({
      rel: "static/models/objects/rug-floor.glb",
      simplifyOptions: null,
      compressTextures: false,
      fromBackup: false,
    });
  });

  it("rejects invalid ratio", () => {
    const parsed = resolveApartmentDecorGlbOptimizeOptions({
      modelRelPath: "rug-floor.glb",
      ratio: 1.5,
    });
    expect(parsed).toEqual({ error: "ratio must be a number in (0, 1]" });
  });
});

import { describe, expect, it } from "vitest";
import { APARTMENT_WINDOW_SHUTTER_MODEL_PATH } from "./apartmentWindowShutterVisual.js";
import {
  buildProceduralApartmentDecorVisual,
  isProceduralApartmentDecorModelPath,
  mergeApartmentDecorManifestPaths,
} from "./apartmentProceduralDecorCatalog.js";

describe("apartmentProceduralDecorCatalog", () => {
  it("includes procedural paths in merged manifest lists", () => {
    const merged = mergeApartmentDecorManifestPaths(["static/models/objects/chair.glb"]);
    expect(merged).toContain("static/models/objects/chair.glb");
    expect(merged).toContain(APARTMENT_WINDOW_SHUTTER_MODEL_PATH);
  });

  it("recognizes procedural decor paths", () => {
    expect(isProceduralApartmentDecorModelPath(APARTMENT_WINDOW_SHUTTER_MODEL_PATH)).toBe(true);
    expect(isProceduralApartmentDecorModelPath("static/models/objects/fish-tank.glb")).toBe(false);
    expect(isProceduralApartmentDecorModelPath("static/models/objects/chair.glb")).toBe(false);
  });

  it("builds procedural visuals for catalog paths", () => {
    expect(buildProceduralApartmentDecorVisual(APARTMENT_WINDOW_SHUTTER_MODEL_PATH)?.name).toBe(
      "apartment_window_shutter",
    );
    expect(buildProceduralApartmentDecorVisual("static/models/objects/chair.glb")).toBeNull();
  });
});

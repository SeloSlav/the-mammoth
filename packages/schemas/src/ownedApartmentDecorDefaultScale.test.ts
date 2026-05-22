import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  OWNED_APARTMENT_DECOR_DEFAULT_SCALE_BY_MODEL,
  buildOwnedApartmentDecorDefaultScaleByModelFromPlacedItems,
  defaultOwnedApartmentDecorScaleForModel,
} from "./ownedApartmentDecorDefaultScale.js";

describe("ownedApartmentDecorDefaultScale", () => {
  it("returns fallback scale for models not yet authored in the reference unit", () => {
    expect(
      defaultOwnedApartmentDecorScaleForModel("static/models/objects/couch.glb"),
    ).toEqual({ uniformScale: 1, verticalScaleMul: 1 });
  });

  it("returns reference scale for authored models (leading slash tolerated)", () => {
    expect(defaultOwnedApartmentDecorScaleForModel("/static/models/objects/sofa.glb")).toEqual({
      uniformScale: 1.6105584619117874,
      verticalScaleMul: 1,
    });
    expect(
      defaultOwnedApartmentDecorScaleForModel("static/models/objects/kitchen-counter-2.glb"),
    ).toEqual({
      uniformScale: 1.2905003590527768,
      verticalScaleMul: 1.2458761734189374,
    });
  });

  it("stays aligned with first placement per model in owned_apartment_builtins.json", () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const raw = JSON.parse(
      readFileSync(join(repoRoot, "content/apartment/owned_apartment_builtins.json"), "utf8"),
    ) as { placedItems?: Array<{ modelRelPath: string; uniformScale: number; verticalScaleMul?: number }> };

    const fromReference = buildOwnedApartmentDecorDefaultScaleByModelFromPlacedItems(
      raw.placedItems ?? [],
    );

    expect(OWNED_APARTMENT_DECOR_DEFAULT_SCALE_BY_MODEL).toEqual(fromReference);
  });
});

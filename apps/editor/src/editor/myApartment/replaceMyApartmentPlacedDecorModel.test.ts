import { describe, expect, it } from "vitest";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  OWNED_APARTMENT_MODEL_FRIDGE,
  ownedApartmentBuiltinsDoc,
  ownedApartmentPlacedItemKindHasStash,
} from "@the-mammoth/schemas";
import { replaceMyApartmentPlacedDecorModelInDoc } from "./replaceMyApartmentPlacedDecorModel.js";

describe("replaceMyApartmentPlacedDecorModelInDoc", () => {
  const modelA = "static/models/objects/chair.glb" as const;
  const modelB = "static/models/objects/water-tank.glb" as const;

  it("keeps pose and scale, updates model and inferred itemKind", () => {
    const doc = ownedApartmentBuiltinsDoc({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        {
          id: "decor-1",
          modelRelPath: modelA,
          fx: 0.42,
          fz: 0.58,
          dy: 1.25,
          yawRad: 0.7,
          pitchRad: 0.15,
          rollRad: -0.05,
          uniformScale: 0.88,
          ignoreSupportSurfaces: true,
          itemKind: "plain" as const,
        },
      ],
    });

    const out = replaceMyApartmentPlacedDecorModelInDoc(doc, "decor-1", modelB);
    expect(out).not.toBeNull();
    expect(out!.replaced).toEqual({
      id: "decor-1",
      modelRelPath: modelB,
      fx: 0.42,
      fz: 0.58,
      dy: 1.25,
      yawRad: 0.7,
      pitchRad: 0.15,
      rollRad: -0.05,
      uniformScale: 0.88,
      verticalScaleMul: 1,
      ignoreSupportSurfaces: true,
      itemKind: "water_tank",
    });
  });

  it("returns null when decor id is missing", () => {
    expect(
      replaceMyApartmentPlacedDecorModelInDoc(DEFAULT_OWNED_APARTMENT_BUILTINS_DOC, "nope", modelB),
    ).toBeNull();
  });

  it("replaces gameplay role — fridge becomes plain décor when swapped to drying rack", () => {
    const dryingRack = "static/models/objects/drying-rack.glb" as const;
    const doc = ownedApartmentBuiltinsDoc({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        {
          id: "fridge-1",
          modelRelPath: OWNED_APARTMENT_MODEL_FRIDGE,
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "fridge" as const,
        },
      ],
    });
    expect(ownedApartmentPlacedItemKindHasStash("fridge")).toBe(true);

    const out = replaceMyApartmentPlacedDecorModelInDoc(doc, "fridge-1", dryingRack);
    expect(out!.replaced.modelRelPath).toBe(dryingRack);
    expect(out!.replaced.itemKind).toBe("plain");
    expect(ownedApartmentPlacedItemKindHasStash(out!.replaced.itemKind)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  apartmentSittableSpecForPlacedItem,
  apartmentSittableSpecFromModelPath,
  normalizeApartmentSittableModelRelPath,
  ownedApartmentPlacedItemKindIsSittable,
} from "./apartmentSittable.js";

describe("apartmentSittable", () => {
  it("resolves canonical model paths", () => {
    expect(apartmentSittableSpecFromModelPath("static/models/objects/chair.glb")?.mode).toBe("sit");
    expect(apartmentSittableSpecFromModelPath("static/models/objects/sofa.glb")?.promptLabel).toBe(
      "Sit",
    );
    expect(apartmentSittableSpecFromModelPath("static/models/objects/toilet.glb")?.mode).toBe(
      "sit",
    );
    expect(apartmentSittableSpecFromModelPath("static/models/objects/bed.glb")?.mode).toBe("lie");
    expect(apartmentSittableSpecFromModelPath("static/models/objects/bed.glb")?.defaultPitchRad).toBe(
      1.45,
    );
  });

  it("normalizes shorthand paths", () => {
    expect(normalizeApartmentSittableModelRelPath("objects/chair.glb")).toBe(
      "static/models/objects/chair.glb",
    );
    expect(
      apartmentSittableSpecFromModelPath("objects/chair.glb")?.modelRelPath,
    ).toContain("chair.glb");
  });

  it("returns null for non-sittable models", () => {
    expect(apartmentSittableSpecFromModelPath("static/models/objects/tv.glb")).toBeNull();
  });

  it("bed item kind resolves bed spec", () => {
    expect(ownedApartmentPlacedItemKindIsSittable("bed")).toBe(true);
    expect(ownedApartmentPlacedItemKindIsSittable("plain")).toBe(false);
    const spec = apartmentSittableSpecForPlacedItem({
      modelRelPath: "static/models/objects/bed.glb",
      itemKind: "bed",
    });
    expect(spec?.mode).toBe("lie");
    expect(spec?.promptLabel).toBe("Lie down");
    expect(spec?.interactRadiusM).toBe(1.05);
    expect(spec?.localSeatOffset.z).toBe(0);
  });
});

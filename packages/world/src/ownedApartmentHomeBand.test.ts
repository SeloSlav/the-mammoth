import { describe, expect, it } from "vitest";
import { BuildingDocSchema, type BuildingDoc } from "@the-mammoth/schemas";
import {
  HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID,
  ownedDefaultApartmentUnitKey,
} from "./ownedApartmentHomeBand.js";
import { TYPICAL_FLOOR_DOC_ID } from "./buildingStairShafts.js";

describe("ownedDefaultApartmentUnitKey", () => {
  it("pins the canonical unit key on the typical plate at roof band level index", () => {
    const building = BuildingDocSchema.parse({
      id: "building_test",
      floorRefs: [
        { levelIndex: 2, floorDocId: "floor_ground", floorOverrideDocId: undefined },
        { levelIndex: 30, floorDocId: "floor_roof", floorOverrideDocId: undefined },
        { levelIndex: 29, floorDocId: TYPICAL_FLOOR_DOC_ID },
      ],
    } satisfies Partial<BuildingDoc>);
    expect(ownedDefaultApartmentUnitKey(building)).toBe(
      `${TYPICAL_FLOOR_DOC_ID}|30|${HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID}`,
    );
  });

  it("uses max floor level across all refs (roof cap counts), matching editor bootstrap", () => {
    const building = BuildingDocSchema.parse({
      id: "building_test",
      floorRefs: [
        { levelIndex: 31, floorDocId: "floor_roof_cap" },
        { levelIndex: 30, floorDocId: TYPICAL_FLOOR_DOC_ID },
      ],
    });
    expect(ownedDefaultApartmentUnitKey(building)).toBe(
      `${TYPICAL_FLOOR_DOC_ID}|31|${HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID}`,
    );
  });
});

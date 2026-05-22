import { describe, expect, it } from "vitest";
import { DEFAULT_OWNED_APARTMENT_BUILTINS_DOC } from "./ownedApartmentBuiltins.js";
import {
  ApartmentUnitLayoutProfilesDocSchema,
  apartmentLayoutDocForUnitKey,
  apartmentUnitLayoutProfileForUnitKey,
  assignApartmentUnitLayoutProfile,
  createApartmentUnitLayoutProfile,
} from "./apartmentUnitLayoutProfiles.js";

describe("ApartmentUnitLayoutProfilesDoc", () => {
  const unitKey = "floor_mamutica_typical|18|unit_e_004";

  it("resolves assigned profile before owned default fallback", () => {
    const profileLayout = {
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [],
    };
    const doc = ApartmentUnitLayoutProfilesDocSchema.parse({
      version: 1,
      profiles: [{ id: "east_004", name: "East 4", layout: profileLayout }],
      assignments: [{ unitKey, profileId: "east_004" }],
    });

    expect(apartmentUnitLayoutProfileForUnitKey(doc, unitKey)?.id).toBe("east_004");
    expect(
      apartmentLayoutDocForUnitKey(doc, unitKey, DEFAULT_OWNED_APARTMENT_BUILTINS_DOC),
    ).toEqual(profileLayout);
  });

  it("falls back to owned defaults when no unit profile is assigned", () => {
    expect(
      apartmentLayoutDocForUnitKey(
        { version: 1, profiles: [], assignments: [] },
        unitKey,
        DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      ),
    ).toBe(DEFAULT_OWNED_APARTMENT_BUILTINS_DOC);
  });

  it("drops assignments to unknown profiles and duplicate unit assignments", () => {
    const doc = ApartmentUnitLayoutProfilesDocSchema.parse({
      version: 1,
      profiles: [
        { id: "a", name: "A", layout: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC },
      ],
      assignments: [
        { unitKey, profileId: "missing" },
        { unitKey, profileId: "a" },
        { unitKey, profileId: "a" },
      ],
    });

    expect(doc.assignments).toEqual([{ unitKey, profileId: "a" }]);
  });

  it("creates profiles and assigns units through helpers", () => {
    const created = createApartmentUnitLayoutProfile(
      { version: 1, profiles: [], assignments: [] },
      { id: "w_001", name: "West 1" },
    );
    const assigned = assignApartmentUnitLayoutProfile(created, unitKey, "w_001");

    expect(assigned.profiles[0]?.layout).toEqual(DEFAULT_OWNED_APARTMENT_BUILTINS_DOC);
    expect(assigned.assignments).toEqual([{ unitKey, profileId: "w_001" }]);
  });
});

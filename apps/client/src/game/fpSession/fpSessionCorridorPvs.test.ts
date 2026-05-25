import { describe, expect, it } from "vitest";
import { createFpSessionCorridorPvsContext } from "./fpSessionCorridorPvs.js";

describe("createFpSessionCorridorPvsContext", () => {
  it("resolves visible unit keys from door entries and retained unit", () => {
    const ctx = createFpSessionCorridorPvsContext({
      buildingWorldOriginY: 0,
      floorSpacingM: 3.2,
      maxLevel: 19,
      unitIdForKey: (key) => key.split("|")[2] ?? null,
      collectDoorEntries: () => [
        {
          unitKey: "floor|2|unit_e_004",
          unitId: "unit_e_004",
          level: 2,
          open01: 0.9,
          isResidentialUnitDoor: true,
        },
      ],
    });
    const snap = ctx.resolveSnapshot({
      feetY: 6.5,
      insideResidentialUnit: false,
      insideApartmentInteriorLightingZone: true,
      containingUnitKey: null,
      retainedUnitKey: "floor|2|unit_e_003",
    });
    expect([...snap.visible.unitKeys].sort()).toEqual(
      ["floor|2|unit_e_003", "floor|2|unit_e_004"].sort(),
    );
  });
});

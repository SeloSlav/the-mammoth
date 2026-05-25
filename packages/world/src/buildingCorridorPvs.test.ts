import { describe, expect, it } from "vitest";
import {
  apartmentDoorAdmitsCorridorInteriorPeek,
  buildOpenDoorUnitKeysByLevel,
  resolveCorridorPvsVisibleUnits,
  unitInteriorVisibleViaCorridorPvs,
} from "./buildingCorridorPvs.js";

describe("buildingCorridorPvs", () => {
  it("admits interior peek only above the open threshold", () => {
    expect(apartmentDoorAdmitsCorridorInteriorPeek(0)).toBe(false);
    expect(apartmentDoorAdmitsCorridorInteriorPeek(0.14)).toBe(false);
    expect(apartmentDoorAdmitsCorridorInteriorPeek(0.15)).toBe(true);
  });

  it("indexes open residential unit doors by level", () => {
    const map = buildOpenDoorUnitKeysByLevel([
      {
        unitKey: "floor|2|unit_e_003",
        unitId: "unit_e_003",
        level: 2,
        open01: 0.5,
        isResidentialUnitDoor: true,
      },
      {
        unitKey: "floor|2|unit_e_004",
        unitId: "unit_e_004",
        level: 2,
        open01: 0,
        isResidentialUnitDoor: true,
      },
      {
        unitKey: "floor|2|manual",
        unitId: "manual",
        level: 2,
        open01: 1,
        isResidentialUnitDoor: false,
      },
    ]);
    expect([...(map.get(2) ?? [])]).toEqual(["floor|2|unit_e_003"]);
  });

  it("resolves corridor-visible units from open doors, retained, and containing keys", () => {
    const open = buildOpenDoorUnitKeysByLevel([
      {
        unitKey: "floor|2|unit_e_004",
        unitId: "unit_e_004",
        level: 2,
        open01: 0.9,
        isResidentialUnitDoor: true,
      },
    ]);
    const resolved = resolveCorridorPvsVisibleUnits({
      playerLevel: 2,
      insideResidentialUnit: false,
      insideApartmentInteriorLightingZone: true,
      containingUnitKey: null,
      retainedUnitKey: "floor|2|unit_e_003",
      openDoorUnitKeysByLevel: open,
      unitIdForKey: (key) => key.split("|")[2] ?? null,
    });
    expect([...resolved.unitKeys].sort()).toEqual(
      ["floor|2|unit_e_003", "floor|2|unit_e_004"].sort(),
    );
    expect([...resolved.unitIds].sort()).toEqual(["unit_e_003", "unit_e_004"].sort());
  });

  it("scopes to containing unit when indoors", () => {
    const resolved = resolveCorridorPvsVisibleUnits({
      playerLevel: 2,
      insideResidentialUnit: true,
      insideApartmentInteriorLightingZone: true,
      containingUnitKey: "floor|2|unit_e_003",
      retainedUnitKey: "floor|2|unit_e_004",
      openDoorUnitKeysByLevel: new Map([[2, new Set(["floor|2|unit_e_004"])]]),
      unitIdForKey: (key) => key.split("|")[2] ?? null,
    });
    expect([...resolved.unitKeys]).toEqual(["floor|2|unit_e_003"]);
  });

  it("gates plaster shells via corridor PVS unit ids", () => {
    const ids = new Set(["unit_e_003"]);
    expect(
      unitInteriorVisibleViaCorridorPvs({
        residentialUnitId: "unit_e_003",
        corridorPvsVisibleUnitIds: ids,
        isResidentialShellPlaster: true,
      }),
    ).toBe(true);
    expect(
      unitInteriorVisibleViaCorridorPvs({
        residentialUnitId: "unit_e_004",
        corridorPvsVisibleUnitIds: ids,
        isResidentialShellPlaster: true,
      }),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  apartmentDoorAdmitsCorridorInteriorPeek,
  APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M,
  buildOpenDoorUnitKeysByLevel,
  buildStoreyRadiusVisibleUnitKeys,
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

  it("includes every open doorway within the peek radius (omnidirectional, not view cone)", () => {
    const map = buildOpenDoorUnitKeysByLevel(
      [
        {
          unitKey: "floor|2|unit_e_near",
          unitId: "unit_e_near",
          level: 2,
          open01: 1,
          isResidentialUnitDoor: true,
          hingeX: 0,
          hingeZ: -2,
          tangentX: 1,
          tangentZ: 0,
          panelWidthM: 1,
        },
        {
          unitKey: "floor|2|unit_e_behind",
          unitId: "unit_e_behind",
          level: 2,
          open01: 1,
          isResidentialUnitDoor: true,
          hingeX: 0,
          hingeZ: 5,
          tangentX: 1,
          tangentZ: 0,
          panelWidthM: 1,
        },
        {
          unitKey: "floor|2|unit_e_far",
          unitId: "unit_e_far",
          level: 2,
          open01: 1,
          isResidentialUnitDoor: true,
          hingeX: 0,
          hingeZ: -20,
          tangentX: 1,
          tangentZ: 0,
          panelWidthM: 1,
        },
      ],
      { cameraX: 0, cameraZ: 0, viewDirX: 0, viewDirZ: -1 },
    );

    expect([...(map.get(2) ?? [])].sort()).toEqual(
      ["floor|2|unit_e_behind", "floor|2|unit_e_near"].sort(),
    );
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

  it("includes same-storey radius units when indoors", () => {
    const resolved = resolveCorridorPvsVisibleUnits({
      playerLevel: 2,
      insideResidentialUnit: true,
      insideApartmentInteriorLightingZone: true,
      containingUnitKey: "floor|2|unit_e_003",
      retainedUnitKey: "floor|2|unit_e_004",
      openDoorUnitKeysByLevel: new Map([[2, new Set(["floor|2|unit_e_005"])]]),
      storeyRadiusVisibleUnitKeys: new Set([
        "floor|2|unit_e_003",
        "floor|2|unit_e_004",
      ]),
      unitIdForKey: (key) => key.split("|")[2] ?? null,
    });
    expect([...resolved.unitKeys].sort()).toEqual(
      ["floor|2|unit_e_003", "floor|2|unit_e_004"].sort(),
    );
  });

  it("builds storey-radius unit keys from hull centers", () => {
    const keys = buildStoreyRadiusVisibleUnitKeys(
      [
        {
          unitKey: "floor|2|unit_near",
          unitId: "unit_near",
          level: 2,
          centerX: 2,
          centerZ: 0,
        },
        {
          unitKey: "floor|2|unit_far",
          unitId: "unit_far",
          level: 2,
          centerX: 40,
          centerZ: 0,
        },
        {
          unitKey: "floor|3|unit_other_storey",
          unitId: "unit_other_storey",
          level: 3,
          centerX: 1,
          centerZ: 0,
        },
      ],
      { storeyLevel: 2, cameraX: 0, cameraZ: 0 },
    );
    expect([...keys]).toEqual(["floor|2|unit_near"]);
    expect(APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M).toBeGreaterThan(2);
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

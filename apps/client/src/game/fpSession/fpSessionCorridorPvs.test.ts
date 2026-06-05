import { describe, expect, it } from "vitest";
import { APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M } from "@the-mammoth/world";
import {
  createFpSessionCorridorPvsContext,
  FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M,
} from "./fpSessionCorridorPvs.js";

describe("createFpSessionCorridorPvsContext", () => {
  it("resolves visible unit keys from door entries and retained unit", () => {
    const ctx = createFpSessionCorridorPvsContext({
      buildingWorldOriginY: 0,
      floorSpacingM: 3.2,
      maxLevel: 19,
      unitIdForKey: (key) => key.split("|")[2] ?? null,
      getDoorEntriesRevision: () => 1,
      getStoreyUnitBoundsRevision: () => 1,
      collectDoorEntries: () => [
        {
          unitKey: "floor|2|unit_e_004",
          unitId: "unit_e_004",
          level: 2,
          open01: 0.9,
          isResidentialUnitDoor: true,
        },
      ],
      collectStoreyUnitBounds: () => [
        {
          unitKey: "floor|2|unit_e_003",
          unitId: "unit_e_003",
          level: 2,
          centerX: 0,
          centerZ: 0,
        },
        {
          unitKey: "floor|2|unit_e_004",
          unitId: "unit_e_004",
          level: 2,
          centerX: 1,
          centerZ: 0,
        },
      ],
    });
    const snap = ctx.resolveSnapshot({
      feetY: 6.5,
      cameraX: 0,
      cameraZ: 0,
      viewDirX: 0,
      viewDirZ: -1,
      insideResidentialUnit: false,
      insideApartmentInteriorLightingZone: true,
      containingUnitKey: null,
      retainedUnitKey: "floor|2|unit_e_003",
    });
    expect([...snap.visible.unitKeys].sort()).toEqual(
      ["floor|2|unit_e_003", "floor|2|unit_e_004"].sort(),
    );
    expect([...snap.visible.unitIds].sort()).toEqual(["unit_e_003", "unit_e_004"].sort());
  });

  it("reuses snapshots inside a visibility volume and invalidates on movement or door revision", () => {
    let doorRevision = 1;
    let unitBoundsRevision = 1;
    let doorCollections = 0;
    let unitCollections = 0;
    const ctx = createFpSessionCorridorPvsContext({
      buildingWorldOriginY: 0,
      floorSpacingM: 3.2,
      maxLevel: 19,
      unitIdForKey: (key) => key.split("|")[2] ?? null,
      getDoorEntriesRevision: () => doorRevision,
      getStoreyUnitBoundsRevision: () => unitBoundsRevision,
      collectDoorEntries: () => {
        doorCollections += 1;
        return [];
      },
      collectStoreyUnitBounds: () => {
        unitCollections += 1;
        return [];
      },
    });
    const base = {
      feetY: 6.5,
      cameraX: 0,
      cameraZ: 0,
      viewDirX: 0,
      viewDirZ: -1,
      insideResidentialUnit: false,
      insideApartmentInteriorLightingZone: true,
      containingUnitKey: null,
      retainedUnitKey: null,
    };

    const first = ctx.resolveSnapshot(base);
    const cached = ctx.resolveSnapshot({
      ...base,
      cameraX: FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M * 0.5,
    });
    expect(cached).toBe(first);
    expect(doorCollections).toBe(1);
    expect(unitCollections).toBe(1);

    const moved = ctx.resolveSnapshot({
      ...base,
      cameraX: FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M + 0.01,
    });
    expect(moved).not.toBe(first);
    expect(doorCollections).toBe(1);
    expect(unitCollections).toBe(1);

    doorRevision += 1;
    const doorChanged = ctx.resolveSnapshot({
      ...base,
      cameraX: FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M + 0.01,
    });
    expect(doorChanged).not.toBe(moved);
    expect(doorCollections).toBe(2);

    unitBoundsRevision += 1;
    const unitBoundsChanged = ctx.resolveSnapshot({
      ...base,
      cameraX: FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M + 0.01,
    });
    expect(unitBoundsChanged).not.toBe(doorChanged);
    expect(unitCollections).toBe(2);
  });

  it("pads cached door queries so movement inside a volume cannot reveal geometry late", () => {
    const unitKey = "floor|2|unit_e_004";
    const ctx = createFpSessionCorridorPvsContext({
      buildingWorldOriginY: 0,
      floorSpacingM: 3.2,
      maxLevel: 19,
      unitIdForKey: (key) => key.split("|")[2] ?? null,
      getDoorEntriesRevision: () => 1,
      getStoreyUnitBoundsRevision: () => 1,
      collectDoorEntries: () => [
        {
          unitKey,
          unitId: "unit_e_004",
          level: 2,
          open01: 1,
          isResidentialUnitDoor: true,
          hingeX: APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M + 0.5,
          hingeZ: 0,
          tangentX: 0,
          tangentZ: 0,
          panelWidthM: 1,
        },
      ],
      collectStoreyUnitBounds: () => [],
    });
    const input = {
      feetY: 6.5,
      cameraX: 0,
      cameraZ: 0,
      viewDirX: 1,
      viewDirZ: 0,
      insideResidentialUnit: false,
      insideApartmentInteriorLightingZone: true,
      containingUnitKey: null,
      retainedUnitKey: null,
    };

    const first = ctx.resolveSnapshot(input);
    expect(first.visible.unitKeys.has(unitKey)).toBe(true);
    expect(
      ctx.resolveSnapshot({
        ...input,
        cameraX: FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M * 0.8,
      }),
    ).toBe(first);
  });

  it("keeps the same-storey safety volume local instead of activating a whole floor", () => {
    const ctx = createFpSessionCorridorPvsContext({
      buildingWorldOriginY: 0,
      floorSpacingM: 3.2,
      maxLevel: 19,
      unitIdForKey: (key) => key.split("|")[2] ?? null,
      getDoorEntriesRevision: () => 1,
      getStoreyUnitBoundsRevision: () => 1,
      collectDoorEntries: () => [],
      collectStoreyUnitBounds: () => [
        {
          unitKey: "floor|2|unit_near",
          unitId: "unit_near",
          level: 2,
          centerX: 5,
          centerZ: 0,
        },
        {
          unitKey: "floor|2|unit_far",
          unitId: "unit_far",
          level: 2,
          centerX: 20,
          centerZ: 0,
        },
      ],
    });

    const snap = ctx.resolveSnapshot({
      feetY: 6.5,
      cameraX: 0,
      cameraZ: 0,
      viewDirX: 1,
      viewDirZ: 0,
      insideResidentialUnit: false,
      insideApartmentInteriorLightingZone: true,
      containingUnitKey: null,
      retainedUnitKey: null,
    });
    expect([...snap.visible.unitKeys]).toEqual(["floor|2|unit_near"]);
  });
});

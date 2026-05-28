import { describe, expect, it } from "vitest";
import {
  fpApplyResidentialInteriorPlateBandOverride,
  fpResolveStairwellLitterVisible,
  fpResolveTopFloorResidentialShellUnitFilter,
  fpResolveTopFloorResidentialShellVisible,
  fpResolveUnitInteriorMeshVisible,
  fpKeepSameStoreyCorridorShellVisibleInsideUnit,
  fpShouldExpandContainingResidentialShellFrustumBounds,
  fpUnitInteriorMeshInActivePlateBand,
} from "./fpSessionFloorPlateVisibility";

const deck16PlateBand = { activePlateBandLo: 17, activePlateBandHi: 17 } as const;

describe("fpApplyResidentialInteriorPlateBandOverride", () => {
  it("clamps a residential interior view back to the local storey", () => {
    expect(
      fpApplyResidentialInteriorPlateBandOverride({
        band: { lo: 1, hi: 30 },
        playerStorey: 12,
        maxBuildingLevel: 30,
        insideResidentialUnit: true,
        trueExteriorView: false,
        cabOccludesWorld: false,
      }),
    ).toEqual({ lo: 12, hi: 12 });
  });

  it("still clamps when the camera pokes outside a wall but feet remain indoors", () => {
    expect(
      fpApplyResidentialInteriorPlateBandOverride({
        band: { lo: 1, hi: 30 },
        playerStorey: 12,
        maxBuildingLevel: 30,
        insideResidentialUnit: true,
        trueExteriorView: false,
        cabOccludesWorld: false,
      }),
    ).toEqual({ lo: 12, hi: 12 });
  });

  it("clamps residential interiors even when cab/shaft probes request a broad band", () => {
    expect(
      fpApplyResidentialInteriorPlateBandOverride({
        band: { lo: 1, hi: 30 },
        playerStorey: 12,
        maxBuildingLevel: 30,
        insideResidentialUnit: true,
        trueExteriorView: false,
        cabOccludesWorld: true,
      }),
    ).toEqual({ lo: 12, hi: 12 });
  });

  it("keeps broad bands for a true exterior view", () => {
    expect(
      fpApplyResidentialInteriorPlateBandOverride({
        band: { lo: 1, hi: 30 },
        playerStorey: 12,
        maxBuildingLevel: 30,
        insideResidentialUnit: true,
        trueExteriorView: true,
        cabOccludesWorld: false,
      }),
    ).toEqual({ lo: 1, hi: 30 });
  });
});

describe("fpResolveUnitInteriorMeshVisible", () => {
  const exteriorOff = {
    exteriorShellPlasterVisible: false,
    insideResidentialUnit: false,
    insideApartmentInteriorLightingZone: false,
    containingResidentialUnitId: null as string | null,
    containingResidentialUnitKey: null as string | null,
  };

  it("keeps exterior unit glass visible outside but hides neighboring glass inside a unit", () => {
    const glassEntry = {
      apartmentUnitKey: null,
      residentialUnitId: "unit_e_004",
      residentialExteriorGlass: true,
      genericInteriorVisibleInResidentialUnit: false,
      apartmentSwingDoor: false,
      isResidentialShellPlaster: false,
    };

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: glassEntry,
        unitInteriorVisible: false,
        apartmentDecorInteriorVisible: false,
        ...exteriorOff,
      }),
    ).toBe(true);

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: glassEntry,
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_003",
        containingResidentialUnitKey: "floor|2|unit_e_003",
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(false);
  });

  it("keeps plaster shells visible from exterior peeks when decor shells are culled", () => {
    const plasterEntry = {
      apartmentUnitKey: null,
      residentialUnitId: "unit_e_003",
      residentialExteriorGlass: false,
      genericInteriorVisibleInResidentialUnit: false,
      apartmentSwingDoor: false,
      isResidentialShellPlaster: true,
    };

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: plasterEntry,
        unitInteriorVisible: false,
        apartmentDecorInteriorVisible: false,
        exteriorShellPlasterVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: false,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
      }),
    ).toBe(true);

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: plasterEntry,
        unitInteriorVisible: false,
        apartmentDecorInteriorVisible: false,
        exteriorShellPlasterVisible: false,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: false,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
      }),
    ).toBe(false);
  });

  it("keeps tagged hallway corridor shells on the active plate band only", () => {
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
          corridorHallwayShell: true,
          plateLevelIndex: 17,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        exteriorShellPlasterVisible: false,
        ...deck16PlateBand,
      }),
    ).toBe(true);
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
          corridorHallwayShell: true,
          plateLevelIndex: 16,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        exteriorShellPlasterVisible: false,
        ...deck16PlateBand,
      }),
    ).toBe(false);
  });

  it("hides untagged anonymous interior filler in the hallway", () => {
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
          corridorHallwayShell: false,
          underStairColumnRoot: false,
          plateLevelIndex: 17,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        exteriorShellPlasterVisible: false,
        ...deck16PlateBand,
      }),
    ).toBe(false);
  });

  it("keeps merged stair-shaft interiors visible in the hallway (segment band owns off-storeys)", () => {
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
          corridorHallwayShell: false,
          underStairColumnRoot: true,
          plateLevelIndex: 17,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        exteriorShellPlasterVisible: false,
        ...deck16PlateBand,
      }),
    ).toBe(true);
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
          corridorHallwayShell: false,
          underStairColumnRoot: true,
          plateLevelIndex: 17,
        },
        unitInteriorVisible: false,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        exteriorShellPlasterVisible: false,
        ...deck16PlateBand,
      }),
    ).toBe(false);
  });

  it("culls unit interior meshes outside the active floor plate band", () => {
    expect(
      fpUnitInteriorMeshInActivePlateBand({
        plateLevelIndex: 17,
        activePlateBandLo: 17,
        activePlateBandHi: 17,
      }),
    ).toBe(true);
    expect(
      fpUnitInteriorMeshInActivePlateBand({
        plateLevelIndex: 5,
        activePlateBandLo: 17,
        activePlateBandHi: 17,
      }),
    ).toBe(false);
  });

  it("shows furnished props for corridor PVS unit keys while walking the hallway", () => {
    const unitKey = "floor_mamutica_16|17|unit_e_003";
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: unitKey,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        exteriorShellPlasterVisible: false,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        corridorPvsVisibleUnitKeys: new Set([unitKey]),
      }),
    ).toBe(true);
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: unitKey,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        exteriorShellPlasterVisible: false,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        corridorPvsVisibleUnitKeys: new Set<string>(),
      }),
    ).toBe(false);
  });

  it("keeps same-storey corridor shells visible inside a residential unit hull", () => {
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
          corridorHallwayShell: true,
          plateLevelIndex: 20,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_003",
        containingResidentialUnitKey: "floor|20|unit_e_003",
        containingStoryLevelIndex: 20,
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(true);
  });

  it("keeps same-storey corridor shells visible inside residential units", () => {
    const storeyLevel = 17;
    expect(
      fpKeepSameStoreyCorridorShellVisibleInsideUnit({
        containingStoryLevelIndex: storeyLevel,
        entry: { corridorHallwayShell: true, plateLevelIndex: storeyLevel },
      }),
    ).toBe(true);
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
          corridorHallwayShell: true,
          plateLevelIndex: storeyLevel,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_004",
        containingResidentialUnitKey: "floor|17|unit_e_004",
        containingStoryLevelIndex: storeyLevel,
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(true);
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
          corridorHallwayShell: true,
          plateLevelIndex: storeyLevel - 1,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_004",
        containingResidentialUnitKey: "floor|17|unit_e_004",
        containingStoryLevelIndex: storeyLevel,
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(false);
  });

  it("shows plaster for corridor PVS-visible units in the hallway", () => {
    const pvsIds = new Set(["unit_e_004"]);
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: "unit_e_004",
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: true,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        exteriorShellPlasterVisible: false,
        corridorPvsVisibleUnitIds: pvsIds,
      }),
    ).toBe(true);

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: "unit_e_005",
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: true,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        exteriorShellPlasterVisible: false,
        corridorPvsVisibleUnitIds: pvsIds,
      }),
    ).toBe(false);
  });

  it("keeps the containing unit shell visible and shows same-storey neighbor plaster indoors", () => {
    const storey = 2;
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: "unit_e_003",
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: true,
          plateLevelIndex: storey,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_003",
        containingResidentialUnitKey: "floor|2|unit_e_003",
        containingStoryLevelIndex: storey,
        activePlateBandLo: storey,
        activePlateBandHi: storey,
        anchorStorey: storey,
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(true);

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: "unit_e_004",
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: true,
          plateLevelIndex: storey,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_003",
        containingResidentialUnitKey: "floor|2|unit_e_003",
        containingStoryLevelIndex: storey,
        activePlateBandLo: storey,
        activePlateBandHi: storey,
        anchorStorey: storey,
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(true);

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: "unit_e_005",
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: true,
          plateLevelIndex: storey - 1,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_003",
        containingResidentialUnitKey: "floor|2|unit_e_003",
        containingStoryLevelIndex: storey,
        activePlateBandLo: storey,
        activePlateBandHi: storey,
        anchorStorey: storey,
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(false);
  });

  it("hides unresolved anonymous interiors indoors, including generic-tagged ones", () => {
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_003",
        containingResidentialUnitKey: "floor|2|unit_e_003",
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(false);

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: true,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_003",
        containingResidentialUnitKey: "floor|2|unit_e_003",
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(false);
  });

  it("shows neighbor unit plaster and glass on the active storey slab from the corridor", () => {
    const storey = 17;
    const glassEntry = {
      apartmentUnitKey: null,
      residentialUnitId: "unit_e_004",
      residentialExteriorGlass: true,
      genericInteriorVisibleInResidentialUnit: false,
      apartmentSwingDoor: false,
      isResidentialShellPlaster: false,
      plateLevelIndex: storey,
    };
    const plasterEntry = {
      apartmentUnitKey: null,
      residentialUnitId: "unit_e_004",
      residentialExteriorGlass: false,
      genericInteriorVisibleInResidentialUnit: false,
      apartmentSwingDoor: false,
      isResidentialShellPlaster: true,
      plateLevelIndex: storey,
    };

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: glassEntry,
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        exteriorShellPlasterVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        activePlateBandLo: storey,
        activePlateBandHi: storey,
        anchorStorey: storey,
      }),
    ).toBe(true);

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: plasterEntry,
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        exteriorShellPlasterVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        activePlateBandLo: storey,
        activePlateBandHi: storey,
        anchorStorey: storey,
      }),
    ).toBe(true);
  });

  it("keeps retained owned-unit plaster visible while walking the corridor lighting zone", () => {
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: "unit_e_003",
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: true,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        exteriorShellPlasterVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        retainedResidentialUnitId: "unit_e_003",
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
      }),
    ).toBe(true);

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: "unit_e_004",
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: true,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        exteriorShellPlasterVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        retainedResidentialUnitId: "unit_e_003",
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
      }),
    ).toBe(false);
  });

  it("keeps instanced apartment swing doors visible indoors when near the building footprint", () => {
    const doorEntry = {
      apartmentUnitKey: null,
      residentialUnitId: null,
      residentialExteriorGlass: false,
      genericInteriorVisibleInResidentialUnit: false,
      apartmentSwingDoor: true,
      isResidentialShellPlaster: false,
    };

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: doorEntry,
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_003",
        containingResidentialUnitKey: "floor|2|unit_e_003",
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(true);

    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: doorEntry,
        unitInteriorVisible: false,
        apartmentDecorInteriorVisible: false,
        insideResidentialUnit: true,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: "unit_e_003",
        containingResidentialUnitKey: "floor|2|unit_e_003",
        exteriorShellPlasterVisible: false,
      }),
    ).toBe(false);
  });

  it("hides neighbor unit exterior glass in the hoistway column", () => {
    const glassEntry = {
      apartmentUnitKey: null,
      residentialUnitId: "unit_e_004",
      residentialExteriorGlass: true,
      genericInteriorVisibleInResidentialUnit: false,
      apartmentSwingDoor: false,
      isResidentialShellPlaster: false,
      plateLevelIndex: 4,
    };
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: glassEntry,
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        exteriorShellPlasterVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        insideElevatorHoistwayColumn: true,
        anchorStorey: 1,
        activePlateBandLo: 1,
        activePlateBandHi: 1,
      }),
    ).toBe(false);
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: { ...glassEntry, plateLevelIndex: 1 },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        exteriorShellPlasterVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        insideElevatorHoistwayColumn: true,
        anchorStorey: 1,
        activePlateBandLo: 1,
        activePlateBandHi: 1,
      }),
    ).toBe(true);
  });

  it("never shows preserved hoistway shaft interior slabs", () => {
    expect(
      fpResolveUnitInteriorMeshVisible({
        entry: {
          apartmentUnitKey: null,
          residentialUnitId: null,
          residentialExteriorGlass: false,
          genericInteriorVisibleInResidentialUnit: false,
          apartmentSwingDoor: false,
          isResidentialShellPlaster: false,
          hoistwayShaftShell: true,
          plateLevelIndex: 10,
        },
        unitInteriorVisible: true,
        apartmentDecorInteriorVisible: true,
        exteriorShellPlasterVisible: true,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: false,
        containingResidentialUnitId: null,
        containingResidentialUnitKey: null,
        activePlateBandLo: 10,
        activePlateBandHi: 10,
      }),
    ).toBe(false);
  });
});

describe("fpResolveStairwellLitterVisible", () => {
  it("only shows litter when feet are inside the stair shaft hull", () => {
    expect(
      fpResolveStairwellLitterVisible({
        segmentInDetailBand: true,
        feetInsideStairShaft: false,
      }),
    ).toBe(false);

    expect(
      fpResolveStairwellLitterVisible({
        segmentInDetailBand: true,
        feetInsideStairShaft: true,
      }),
    ).toBe(true);
  });

  it("still respects the stair segment detail band", () => {
    expect(
      fpResolveStairwellLitterVisible({
        segmentInDetailBand: false,
        feetInsideStairShaft: true,
      }),
    ).toBe(false);
  });
});

describe("fpShouldExpandContainingResidentialShellFrustumBounds", () => {
  it("expands containing residential shell bounds indoors", () => {
    expect(
      fpShouldExpandContainingResidentialShellFrustumBounds({
        insideResidentialUnit: true,
        containingResidentialUnitId: "unit_e_003",
        entry: {
          residentialUnitId: "unit_e_003",
          apartmentUnitKey: null,
        },
      }),
    ).toBe(true);
  });

  it("does not expand apartment props/decor shells", () => {
    expect(
      fpShouldExpandContainingResidentialShellFrustumBounds({
        insideResidentialUnit: true,
        containingResidentialUnitId: "unit_e_003",
        entry: {
          residentialUnitId: null,
          apartmentUnitKey: "floor|2|unit_e_003",
        },
      }),
    ).toBe(false);
  });
});

describe("fpResolveTopFloorResidentialShell visibility", () => {
  it("restricts top-floor shells to the containing unit indoors", () => {
    expect(
      fpResolveTopFloorResidentialShellUnitFilter({
        insideResidentialUnit: true,
        containingResidentialUnitId: "unit_e_003",
      }),
    ).toBe("unit_e_003");
    expect(
      fpResolveTopFloorResidentialShellVisible({
        shellUnitId: "unit_e_003",
        onlyUnitId: "unit_e_003",
        unitInteriorVisible: true,
      }),
    ).toBe(true);
    expect(
      fpResolveTopFloorResidentialShellVisible({
        shellUnitId: "unit_e_004",
        onlyUnitId: "unit_e_003",
        unitInteriorVisible: true,
      }),
    ).toBe(false);
  });

  it("keeps the full top-floor shell set for exterior views", () => {
    expect(
      fpResolveTopFloorResidentialShellUnitFilter({
        insideResidentialUnit: false,
        containingResidentialUnitId: null,
      }),
    ).toBeNull();
    expect(
      fpResolveTopFloorResidentialShellVisible({
        shellUnitId: "unit_e_004",
        onlyUnitId: null,
        unitInteriorVisible: true,
      }),
    ).toBe(true);
  });
});

import {
  fpPointNearStairShaftForPlateBand,
  fpMergeStairShaftPlateBandWithElevator,
} from "./fpSessionFloorPlateVisibility.js";
import type { BuildingStairShaftSpec } from "@the-mammoth/world";

const SAMPLE_SHAFT: BuildingStairShaftSpec = {
  planKey: "0,0-test",
  id: "stairs_test",
  px: 10,
  pz: 20,
  sx: 4,
  sz: 4,
  syPlate: 3,
  bottomY: 0,
  storeyCount: 19,
  storeySpacing: 3.16,
  minLevelIndex: 1,
  entryDoorContexts: [],
  exteriorShaftFaces: ["e"],
};

describe("fpPointNearStairShaftForPlateBand", () => {
  it("returns true for a point a few meters outside the tight inner shaft (corridor door line)", () => {
    const innerHalf = SAMPLE_SHAFT.sx * 0.5 - 0.18;
    const justOutsideInnerFaceX = SAMPLE_SHAFT.px + innerHalf + 1.2;
    expect(
      fpPointNearStairShaftForPlateBand(
        justOutsideInnerFaceX,
        1.5,
        SAMPLE_SHAFT.pz,
        [SAMPLE_SHAFT],
      ),
    ).toBe(true);
  });

  it("returns false far from the shaft on the same floor", () => {
    expect(
      fpPointNearStairShaftForPlateBand(0, 1.5, 0, [SAMPLE_SHAFT]),
    ).toBe(false);
  });
});

describe("fpMergeStairShaftPlateBandWithElevator", () => {
  it("keeps a wide elevator/hoistway band when stair-core proximity would otherwise cap storeys", () => {
    const merged = fpMergeStairShaftPlateBandWithElevator(
      { lo: 1, hi: 20, hoistwayPlateBoost: true },
      true,
      20,
      5,
    );
    expect(merged).toEqual({ lo: 1, hi: 20 });
  });

  it("applies the stair-local cap when not in a hoistway shell context", () => {
    const merged = fpMergeStairShaftPlateBandWithElevator(
      { lo: 4, hi: 8, hoistwayPlateBoost: false },
      true,
      20,
      10,
    );
    expect(merged.lo).toBeGreaterThanOrEqual(8);
    expect(merged.hi).toBeLessThanOrEqual(14);
    expect(merged.hi - merged.lo).toBeLessThan(8);
  });

  it("no-ops when not inside a stair shaft probe", () => {
    expect(
      fpMergeStairShaftPlateBandWithElevator(
        { lo: 2, hi: 6, hoistwayPlateBoost: false },
        false,
        20,
        10,
      ),
    ).toEqual({ lo: 2, hi: 6 });
  });
});

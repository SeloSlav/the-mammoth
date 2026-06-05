import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createFpSessionFloorPlateVisibility } from "./fpSessionFloorPlateVisibility.js";
import type { FpSessionUnitInteriorMeshEntry } from "./fpSessionUnitInteriorShellMeshes.js";

function hoistwayEntry(mesh: THREE.Mesh): FpSessionUnitInteriorMeshEntry {
  return {
    mesh,
    residentialUnitId: null,
    apartmentUnitKey: null,
    residentialExteriorGlass: false,
    genericInteriorVisibleInResidentialUnit: false,
    apartmentSwingDoor: false,
    isResidentialShellPlaster: false,
    plateLevelIndex: 1,
    corridorHallwayShell: false,
    underStairColumnRoot: false,
    hoistwayShaftShell: true,
  };
}

describe("createFpSessionFloorPlateVisibility collection revisions", () => {
  it("applies visibility after an equal-sized interior mesh collection rebuild", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.updateMatrixWorld(true);
    const firstMesh = new THREE.Mesh();
    const entries: FpSessionUnitInteriorMeshEntry[] = [hoistwayEntry(firstMesh)];
    let revision = 1;
    const visibility = createFpSessionFloorPlateVisibility({
      camera,
      buildingRoot: new THREE.Group(),
      buildingWorldBounds: new THREE.Box3(
        new THREE.Vector3(-10, 0, -10),
        new THREE.Vector3(10, 10, 10),
      ),
      maxBuildingLevel: 1,
      storeyOpts: {
        buildingWorldOriginY: 0,
        floorSpacingM: 3.2,
        maxLevel: 1,
      },
      unitInteriorMeshEntries: entries,
      getUnitInteriorMeshEntriesRevision: () => revision,
      topFloorResidentialUnitShellMeshes: [],
      apartmentDecorInteriorMeshes: [],
      fpElevators: {
        getCabOccludedViewStorey: () => null,
        getFloorVisibilityBand: () => ({ lo: 1, hi: 1, hoistwayPlateBoost: false }),
        isInsideAnyCabHud: () => false,
        isInsideAnyElevatorCabChamber: () => false,
      },
      stairShaftInteriorLightBounds: [],
      stairShaftSpecs: [],
      feetPos: new THREE.Vector3(0, 0, 0),
      getContainingResidentialUnit: () => null,
      floorVisCamWorld: new THREE.Vector3(),
      floorVisCamDir: new THREE.Vector3(),
    });

    visibility.syncBuildingFloorPlateVisibility(0);
    expect(firstMesh.visible).toBe(false);

    const replacementMesh = new THREE.Mesh();
    entries[0] = hoistwayEntry(replacementMesh);
    visibility.syncBuildingFloorPlateVisibility(16);
    expect(replacementMesh.visible).toBe(true);

    revision += 1;
    visibility.syncBuildingFloorPlateVisibility(32);
    expect(replacementMesh.visible).toBe(false);
  });
});

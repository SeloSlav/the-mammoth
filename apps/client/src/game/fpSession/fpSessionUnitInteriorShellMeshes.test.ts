import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  collectFpSessionTopFloorResidentialUnitShellMeshes,
  collectFpSessionUnitInteriorMeshEntries,
  isResidentialUnitShellPlasterMesh,
} from "./fpSessionUnitInteriorShellMeshes.js";

describe("collectFpSessionTopFloorResidentialUnitShellMeshes", () => {
  it("collects only top-floor residential unit shell meshes", () => {
    const buildingRoot = new THREE.Group();

    const floor18 = new THREE.Group();
    floor18.userData.mammothPlateLevelIndex = 18;
    const floor19 = new THREE.Group();
    floor19.userData.mammothPlateLevelIndex = 19;

    const lowerUnitMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    lowerUnitMesh.userData.mammothPlacedObjectId = "unit_e_001";
    floor18.add(lowerUnitMesh);

    const topUnitMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    topUnitMesh.userData.mammothPlacedObjectId = "unit_e_003";
    floor19.add(topUnitMesh);

    const topCorridorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    topCorridorMesh.userData.mammothPlacedObjectId = "corridor_east";
    floor19.add(topCorridorMesh);

    buildingRoot.add(floor18);
    buildingRoot.add(floor19);

    const result = collectFpSessionTopFloorResidentialUnitShellMeshes(buildingRoot);
    expect(result).toHaveLength(1);
    expect(result[0]?.mesh).toBe(topUnitMesh);
    expect(result[0]?.unitId).toBe("unit_e_003");
  });
});

describe("isResidentialUnitShellPlasterMesh", () => {
  it("treats merged unit shell bundles as plaster (not glass-only merges)", () => {
    const parquet = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    parquet.name = "merged_unit_shell:unit_e_003";
    expect(isResidentialUnitShellPlasterMesh(parquet)).toBe(true);

    const glassBundle = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    glassBundle.name = "merged_unit_shell:unit_e_003";
    glassBundle.userData.mammothResidentialUnitExteriorGlass = true;
    expect(isResidentialUnitShellPlasterMesh(glassBundle)).toBe(false);
  });
});

describe("collectFpSessionUnitInteriorMeshEntries", () => {
  it("resolves residential shell unit ids and apartment prop unit keys from ancestors", () => {
    const buildingRoot = new THREE.Group();
    const floor = new THREE.Group();
    floor.userData.mammothPlateLevelIndex = 7;

    const shellMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    shellMesh.name = "shell_wall_n_solid";
    shellMesh.userData.mammothUnitInterior = true;
    shellMesh.userData.mammothPlacedObjectId = "unit_w_004";
    floor.add(shellMesh);

    const propGroup = new THREE.Group();
    propGroup.userData.mammothApartmentUnitKey = "floor-7:unit_w_004";
    const propMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    propMesh.userData.mammothUnitInterior = true;
    propGroup.add(propMesh);
    floor.add(propGroup);

    buildingRoot.add(floor);

    const result = collectFpSessionUnitInteriorMeshEntries(buildingRoot);
    expect(result).toHaveLength(2);
    expect(result[0]?.mesh).toBe(shellMesh);
    expect(result[0]?.residentialUnitId).toBe("unit_w_004");
    expect(result[0]?.apartmentUnitKey).toBe(null);
    expect(result[0]?.residentialExteriorGlass).toBe(false);
    expect(result[0]?.apartmentSwingDoor).toBe(false);
    expect(result[0]?.isResidentialShellPlaster).toBe(true);
    expect(result[0]?.plateLevelIndex).toBe(7);
    expect(result[1]?.mesh).toBe(propMesh);
    expect(result[1]?.residentialUnitId).toBe(null);
    expect(result[1]?.apartmentUnitKey).toBe("floor-7:unit_w_004");
    expect(result[1]?.residentialExteriorGlass).toBe(false);
    expect(result[1]?.plateLevelIndex).toBe(7);
  });

  it("classifies merged unit shell bundles as residential plaster", () => {
    const buildingRoot = new THREE.Group();
    const floor = new THREE.Group();
    floor.userData.mammothPlateLevelIndex = 12;

    const merged = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    merged.name = "merged_unit_shell:unit_w_004";
    merged.userData.mammothUnitInterior = true;
    merged.userData.mammothPlacedObjectId = "unit_w_004";
    floor.add(merged);
    buildingRoot.add(floor);

    const [entry] = collectFpSessionUnitInteriorMeshEntries(buildingRoot);
    expect(entry?.isResidentialShellPlaster).toBe(true);
    expect(entry?.residentialUnitId).toBe("unit_w_004");
  });

  it("recognizes generic unit ids and exterior unit glass", () => {
    const buildingRoot = new THREE.Group();
    const floor = new THREE.Group();
    floor.userData.mammothPlateLevelIndex = 7;

    const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    glass.userData.mammothUnitInterior = true;
    glass.userData.mammothPlacedObjectId = "unit_north";
    glass.userData.mammothResidentialUnitExteriorGlass = true;
    floor.add(glass);

    buildingRoot.add(floor);

    const result = collectFpSessionUnitInteriorMeshEntries(buildingRoot);
    expect(result).toHaveLength(1);
    expect(result[0]?.residentialUnitId).toBe("unit_north");
    expect(result[0]?.residentialExteriorGlass).toBe(true);
  });

  it("inherits generic-in-residential and apartment ownership flags from ancestors", () => {
    const buildingRoot = new THREE.Group();
    const floor = new THREE.Group();
    floor.userData.mammothPlateLevelIndex = 7;

    const group = new THREE.Group();
    group.userData.mammothApartmentUnitKey = "floor-7:unit_e_002";
    group.userData.mammothGenericInteriorVisibleInResidentialUnit = true;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.userData.mammothUnitInterior = true;
    group.add(mesh);
    floor.add(group);
    buildingRoot.add(floor);

    const result = collectFpSessionUnitInteriorMeshEntries(buildingRoot);
    expect(result).toHaveLength(1);
    expect(result[0]?.apartmentUnitKey).toBe("floor-7:unit_e_002");
    expect(result[0]?.genericInteriorVisibleInResidentialUnit).toBe(true);
    expect(result[0]?.apartmentSwingDoor).toBe(false);
  });

  it("tags instanced apartment swing doors for corridor visibility", () => {
    const buildingRoot = new THREE.Group();
    const floor = new THREE.Group();
    floor.userData.mammothPlateLevelIndex = 20;

    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    doorMesh.name = "apartment_doors_glazed:L20";
    doorMesh.userData.mammothUnitInterior = true;
    doorMesh.userData.mammothApartmentSwingDoor = true;
    floor.add(doorMesh);
    buildingRoot.add(floor);

    const result = collectFpSessionUnitInteriorMeshEntries(buildingRoot);
    expect(result).toHaveLength(1);
    expect(result[0]?.apartmentSwingDoor).toBe(true);
    expect(result[0]?.residentialUnitId).toBe(null);
    expect(result[0]?.apartmentUnitKey).toBe(null);
    expect(result[0]?.plateLevelIndex).toBe(20);
  });
});

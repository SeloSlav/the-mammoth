import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { collectFpSessionTopFloorResidentialUnitShellMeshes } from "./fpSessionUnitInteriorShellMeshes.js";

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

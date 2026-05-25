import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  hideUnitInteriorMeshesForExteriorAuthView,
  restoreUnitInteriorMeshVisibilityAfterAuthView,
} from "./mammothAuthBackdropInteriorVisibility.js";

describe("mammothAuthBackdropInteriorVisibility", () => {
  it("hides unit interior shells but keeps exterior window glass visible", () => {
    const root = new THREE.Group();

    const plaster = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    plaster.userData.mammothUnitInterior = true;
    plaster.name = "shell_wall_e_0";

    const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    glass.userData.mammothUnitInterior = true;
    glass.userData.mammothResidentialUnitExteriorGlass = true;
    glass.name = "unit_exterior_glass_e_0";

    const cladding = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    cladding.name = "shell_exterior_cladding_e_0";

    root.add(plaster, glass, cladding);

    hideUnitInteriorMeshesForExteriorAuthView(root);

    expect(plaster.visible).toBe(false);
    expect(glass.visible).toBe(true);
    expect(cladding.visible).toBe(true);
  });

  it("keeps top-floor roof-silhouette ceilings visible", () => {
    const root = new THREE.Group();

    const floor18 = new THREE.Group();
    floor18.userData.mammothPlateLevelIndex = 18;
    const floor19 = new THREE.Group();
    floor19.userData.mammothPlateLevelIndex = 19;

    const lowerCeiling = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    lowerCeiling.userData.mammothUnitInterior = true;
    lowerCeiling.name = "shell_ceiling_e_0";
    floor18.add(lowerCeiling);

    const topCeiling = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    topCeiling.userData.mammothUnitInterior = true;
    topCeiling.name = "shell_ceiling_e_1";
    floor19.add(topCeiling);

    root.add(floor18, floor19);

    hideUnitInteriorMeshesForExteriorAuthView(root);

    expect(lowerCeiling.visible).toBe(false);
    expect(topCeiling.visible).toBe(true);
  });

  it("restore resets hidden interior shells for FP session reuse", () => {
    const root = new THREE.Group();

    const plaster = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    plaster.userData.mammothUnitInterior = true;

    root.add(plaster);
    hideUnitInteriorMeshesForExteriorAuthView(root);
    expect(plaster.visible).toBe(false);

    restoreUnitInteriorMeshVisibilityAfterAuthView(root);
    expect(plaster.visible).toBe(true);
  });
});

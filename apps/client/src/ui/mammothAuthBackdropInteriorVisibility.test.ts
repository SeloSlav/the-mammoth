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

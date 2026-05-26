import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { restoreUnitInteriorMeshVisibilityAfterAuthView } from "./mammothAuthBackdropInteriorVisibility.js";

describe("mammothAuthBackdropInteriorVisibility", () => {
  it("restore resets hidden interior shells for FP session reuse", () => {
    const root = new THREE.Group();
    root.userData.mammothPlateLevelIndex = 0;
    const plaster = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    plaster.userData.mammothUnitInterior = true;
    plaster.visible = false;
    root.add(plaster);

    restoreUnitInteriorMeshVisibilityAfterAuthView(root);
    expect(plaster.visible).toBe(true);
  });
});

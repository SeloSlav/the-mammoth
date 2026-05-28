import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  hideUnitInteriorMeshesForAuthView,
  restoreUnitInteriorMeshVisibilityAfterAuthView,
} from "./mammothAuthBackdropInteriorVisibility.js";

describe("mammothAuthBackdropInteriorVisibility", () => {
  it("hide keeps post-merge unit shells (parquet floor bundle) visible", () => {
    const root = new THREE.Group();
    const mergedFloor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mergedFloor.name = "merged_unit_shell:unit_e_003";
    mergedFloor.userData.mammothUnitInterior = true;
    mergedFloor.userData.mammothPlacedObjectId = "unit_e_003";
    root.add(mergedFloor);

    hideUnitInteriorMeshesForAuthView(root);
    expect(mergedFloor.visible).toBe(true);
  });

  it("hide keeps unit plaster shells visible for exterior peek through glass", () => {
    const root = new THREE.Group();
    const unitRoom = new THREE.Group();
    unitRoom.userData.mammothPlacedObjectId = "unit_e_003";
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    floor.name = "shell_floor_0";
    floor.userData.mammothUnitInterior = true;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    wall.name = "shell_wall_n";
    wall.userData.mammothUnitInterior = true;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    glass.name = "unit_exterior_glass_n_0";
    glass.userData.mammothUnitInterior = true;
    glass.userData.mammothResidentialUnitExteriorGlass = true;
    unitRoom.add(floor, wall, glass);
    root.add(unitRoom);

    hideUnitInteriorMeshesForAuthView(root);
    expect(floor.visible).toBe(true);
    expect(wall.visible).toBe(true);
    expect(glass.visible).toBe(true);
  });

  it("hide drops corridor walls but keeps hallway floor/ceiling slabs for auth orbit", () => {
    const root = new THREE.Group();
    const corridorFloor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    corridorFloor.name = "shell_floor_0";
    corridorFloor.userData.mammothUnitInterior = true;
    corridorFloor.userData.mammothCorridorHallwayShell = true;
    const corridorCeil = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    corridorCeil.name = "shell_ceiling_0";
    corridorCeil.userData.mammothUnitInterior = true;
    corridorCeil.userData.mammothCorridorHallwayShell = true;
    const corridorWall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    corridorWall.name = "shell_wall_e";
    corridorWall.userData.mammothUnitInterior = true;
    root.add(corridorFloor, corridorCeil, corridorWall);

    hideUnitInteriorMeshesForAuthView(root);
    expect(corridorFloor.visible).toBe(true);
    expect(corridorCeil.visible).toBe(true);
    expect(corridorWall.visible).toBe(false);
  });

  it("hide drops corridor shells that share shell_* names but are not unit-owned", () => {
    const root = new THREE.Group();
    const corridorShell = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    corridorShell.name = "shell_wall_e";
    corridorShell.userData.mammothUnitInterior = true;
    root.add(corridorShell);

    hideUnitInteriorMeshesForAuthView(root);
    expect(corridorShell.visible).toBe(false);
  });

  it("hide drops tagged corridor signage (STEP lintels) for exterior auth orbit", () => {
    const root = new THREE.Group();
    const stepShell = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    stepShell.name = "stairwell_corridor_sign_0_shell";
    stepShell.userData.mammothUnitInterior = true;
    const stepBoard = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    stepBoard.name = "stairwell_corridor_sign_0_board_px";
    stepBoard.userData.mammothUnitInterior = true;
    const facade = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    root.add(stepShell, stepBoard, facade);

    hideUnitInteriorMeshesForAuthView(root);
    expect(stepShell.visible).toBe(false);
    expect(stepBoard.visible).toBe(false);
    expect(facade.visible).toBe(true);
  });

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

  it("hide then restore round-trips for shared megablock cache handoff", () => {
    const root = new THREE.Group();
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    sign.userData.mammothUnitInterior = true;
    root.add(sign);

    hideUnitInteriorMeshesForAuthView(root);
    expect(sign.visible).toBe(false);
    restoreUnitInteriorMeshVisibilityAfterAuthView(root);
    expect(sign.visible).toBe(true);
  });
});

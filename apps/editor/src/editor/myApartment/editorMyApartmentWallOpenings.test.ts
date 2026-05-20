import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { OwnedApartmentBuiltinsDocSchema } from "@the-mammoth/schemas";
import {
  clampWallOpeningTangentOffsetM,
  defaultOwnedApartmentWallDoorOpening,
} from "@the-mammoth/world";
import {
  clampMyApartmentWallOpeningProxyPose,
  EDITOR_MY_APARTMENT_WALL_RUN_LENGTH_UD,
  readEditorWallSlabExtentsForOpeningClamp,
  writeEditorWallSlabExtentsCache,
} from "./editorMyApartmentMeshes.js";

describe("wall door openings", () => {
  it("parses wallItems with openings from schema", () => {
    const doc = OwnedApartmentBuiltinsDocSchema.parse({
      version: 2,
      wallItems: [
        {
          id: "wall_a",
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          sizeX: 3,
          sizeY: 2.6,
          sizeZ: 0.08,
          material: { useMetalnessMap: false, useHeightMap: false },
          openings: [defaultOwnedApartmentWallDoorOpening("door_a")],
        },
      ],
    });
    expect(doc.wallItems[0]?.openings).toHaveLength(1);
  });

  it("reads slab extents for opening clamp without updateMatrixWorld", () => {
    const wallRoot = new THREE.Group();
    const ref = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    ref.name = "wall_slab_ref";
    ref.scale.set(6.5, 2.8, 0.07);
    wallRoot.add(ref);
    const visual = new THREE.Group();
    visual.name = "wall_visual";
    for (let i = 0; i < 40; i++) {
      visual.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.07)));
    }
    wallRoot.add(visual);
    const updateSpy = vi.spyOn(wallRoot, "updateMatrixWorld");
    writeEditorWallSlabExtentsCache(wallRoot, { sizeX: 6.5, sizeZ: 0.07 });
    const extents = readEditorWallSlabExtentsForOpeningClamp(wallRoot, {
      sizeX: 2,
      sizeZ: 0.08,
    });
    expect(extents.sizeX).toBeCloseTo(6.5, 4);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(wallRoot.userData[EDITOR_MY_APARTMENT_WALL_RUN_LENGTH_UD]).toBeCloseTo(6.5, 4);
    updateSpy.mockRestore();
  });

  it("clamps opening proxy drag to the wall length", () => {
    const wallItem = {
      id: "wall_a",
      fx: 0.5,
      fz: 0.5,
      dy: 0,
      yawRad: 0,
      pitchRad: 0,
      sizeX: 2,
      sizeY: 2.6,
      sizeZ: 0.08,
      material: { useMetalnessMap: false, useHeightMap: false },
      openings: [defaultOwnedApartmentWallDoorOpening("door_a")],
    };
    const wallRoot = new THREE.Group();
    wallRoot.userData.mammothEditorMyApartmentWallId = "wall_a";
    const ref = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    ref.scale.set(2, 2.6, 0.08);
    ref.position.y = 2.6 / 2;
    wallRoot.add(ref);
    const proxy = new THREE.Group();
    proxy.position.set(5, 0, 0);
    wallRoot.add(proxy);
    clampMyApartmentWallOpeningProxyPose(proxy, wallRoot, wallItem, "door_a");
    const max = clampWallOpeningTangentOffsetM(2, 0.9, 999);
    expect(proxy.position.x).toBeCloseTo(max, 4);
    expect(proxy.position.y).toBeCloseTo(1.05, 4);
  });
});

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { OwnedApartmentBuiltinsDocSchema } from "@the-mammoth/schemas";
import {
  clampWallOpeningTangentOffsetM,
  defaultOwnedApartmentWallDoorOpening,
} from "@the-mammoth/world";
import { clampMyApartmentWallOpeningProxyPose } from "./editorMyApartmentMeshes.js";

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

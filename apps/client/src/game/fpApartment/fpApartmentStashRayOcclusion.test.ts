import * as THREE from "three";
import { MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER } from "@the-mammoth/engine";
import { describe, expect, it } from "vitest";
import {
  createFpApartmentStashRayOcclusion,
  isApartmentStashRayOccluderMesh,
} from "./fpApartmentStashRayOcclusion.js";
import { MAMMOTH_FP_INTERIOR_PARTITION_SOLID } from "@the-mammoth/world";

describe("isApartmentStashRayOccluderMesh", () => {
  it("accepts interior shell solids and rejects stash picks", () => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    wall.userData.mammothUnitInterior = true;

    const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    pick.userData.mammothApartmentStashKey = "unit#footlocker";

    expect(isApartmentStashRayOccluderMesh(wall)).toBe(true);
    expect(isApartmentStashRayOccluderMesh(pick)).toBe(false);
  });

  it("accepts authored partition solids", () => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    wall.userData[MAMMOTH_FP_INTERIOR_PARTITION_SOLID] = true;
    expect(isApartmentStashRayOccluderMesh(wall)).toBe(true);
  });
});

describe("createFpApartmentStashRayOcclusion", () => {
  it("blocks stash targets behind a unit interior wall", () => {
    const buildingRoot = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 4));
    wall.position.set(0, 1.25, 0);
    wall.userData.mammothUnitInterior = true;
    wall.layers.set(MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER);
    buildingRoot.add(wall);

    const stashPick = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5));
    stashPick.position.set(0, 1, 3);
    stashPick.userData.mammothApartmentStashKey = "unit#grow_tray:abc";
    buildingRoot.add(stashPick);
    buildingRoot.updateMatrixWorld(true);

    const occlusion = createFpApartmentStashRayOcclusion();
    occlusion.rebuildFromBuildingRoot(buildingRoot);

    const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
    camera.position.set(0, 1.6, -2);
    camera.lookAt(0, 1.4, 3);
    camera.updateMatrixWorld(true);

    const target = new THREE.Vector3(0, 1, 3);
    expect(occlusion.targetOccludedFromCamera(camera, target)).toBe(true);

    const nearestWall = occlusion.nearestOccluderDistanceAlongViewRay(camera, 8);
    expect(nearestWall).not.toBeNull();
    expect(nearestWall!).toBeLessThan(camera.position.distanceTo(target));
  });
});

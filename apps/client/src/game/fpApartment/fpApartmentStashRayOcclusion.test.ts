import * as THREE from "three";
import { MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER } from "@the-mammoth/engine";
import { describe, expect, it, vi } from "vitest";
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

  it("traverses only blockers in the requested apartment volume", () => {
    const buildingRoot = new THREE.Group();
    const targetUnit = new THREE.Group();
    targetUnit.userData.mammothApartmentUnitKey = "floor|20|unit_target";
    const targetWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 4));
    targetWall.position.set(0, 1.25, 0);
    targetWall.userData.mammothUnitInterior = true;
    targetWall.layers.set(MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER);
    targetUnit.add(targetWall);
    buildingRoot.add(targetUnit);

    const offVolumeUnit = new THREE.Group();
    offVolumeUnit.userData.mammothApartmentUnitKey = "floor|20|unit_off_volume";
    const offVolumeWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 4));
    offVolumeWall.position.set(20, 1.25, 0);
    offVolumeWall.userData.mammothUnitInterior = true;
    offVolumeWall.layers.set(MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER);
    offVolumeUnit.add(offVolumeWall);
    buildingRoot.add(offVolumeUnit);
    buildingRoot.updateMatrixWorld(true);

    const targetRaycast = vi.spyOn(targetWall, "raycast");
    const offVolumeRaycast = vi.spyOn(offVolumeWall, "raycast");
    const occlusion = createFpApartmentStashRayOcclusion();
    occlusion.rebuildFromBuildingRoot(buildingRoot);

    const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
    camera.position.set(0, 1.6, -2);
    camera.lookAt(0, 1.4, 3);
    camera.updateMatrixWorld(true);

    expect(
      occlusion.targetOccludedFromCamera(
        camera,
        new THREE.Vector3(0, 1, 3),
        "floor|20|unit_target",
      ),
    ).toBe(true);
    expect(targetRaycast).toHaveBeenCalled();
    expect(offVolumeRaycast).not.toHaveBeenCalled();
  });
});

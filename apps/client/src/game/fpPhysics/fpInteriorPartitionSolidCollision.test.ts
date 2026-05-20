import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildOwnedApartmentPartitionWallInGroup,
  MAMMOTH_FP_INTERIOR_PARTITION_SOLID,
  defaultOwnedApartmentWallDoorOpening,
} from "@the-mammoth/world";
import { createFpInteriorPartitionSolidCollision } from "./fpInteriorPartitionSolidCollision.js";

describe("createFpInteriorPartitionSolidCollision", () => {
  it("emits world AABB for tagged BoxGeometry meshes overlapping XZ query", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
    mesh.position.set(10, 0, 10);
    mesh.userData[MAMMOTH_FP_INTERIOR_PARTITION_SOLID] = true;
    root.add(mesh);
    root.updateMatrixWorld(true);

    const host = createFpInteriorPartitionSolidCollision();
    host.rebuildFromRoots([root]);

    const hits: unknown[] = [];
    host.visitCollisionAabbsInXZ(9, 11, 9, 11, (a) => hits.push(a));
    expect(hits.length).toBe(1);

    hits.length = 0;
    host.visitCollisionAabbsInXZ(0, 1, 0, 1, () => hits.push(1));
    expect(hits.length).toBe(0);
  });

  it("emits AABBs for holed partition wall fragments (BufferGeometry after world-metric UVs)", () => {
    const buildingRoot = new THREE.Group();
    const wallRoot = new THREE.Group();
    wallRoot.position.set(4, 0, 6);
    wallRoot.rotation.y = 0.5;
    buildingRoot.add(wallRoot);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    buildOwnedApartmentPartitionWallInGroup({
      parent: wallRoot,
      sizeX: 4,
      sizeY: 2.5,
      sizeZ: 0.12,
      openings: [defaultOwnedApartmentWallDoorOpening("door_a")],
      wallMaterial: wallMat,
      opts: { fpInteriorPartitionSolid: true },
    });
    buildingRoot.updateMatrixWorld(true);

    const host = createFpInteriorPartitionSolidCollision();
    host.rebuildFromRoots([buildingRoot]);

    const hits: { min: number[]; max: number[] }[] = [];
    host.visitCollisionAabbsInXZ(-20, 20, -20, 20, (aabb) => {
      hits.push({ min: [...aabb.min], max: [...aabb.max] });
    });
    expect(hits.length).toBeGreaterThan(1);

    const taggedMeshes: THREE.Mesh[] = [];
    wallRoot.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.userData[MAMMOTH_FP_INTERIOR_PARTITION_SOLID] === true
      ) {
        taggedMeshes.push(obj);
      }
    });
    expect(taggedMeshes.some((m) => !(m.geometry instanceof THREE.BoxGeometry))).toBe(
      true,
    );
  });

  it("skips meshes hidden by an ancestor", () => {
    const root = new THREE.Group();
    const wrap = new THREE.Group();
    wrap.visible = false;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.userData[MAMMOTH_FP_INTERIOR_PARTITION_SOLID] = true;
    wrap.add(mesh);
    root.add(wrap);
    root.updateMatrixWorld(true);

    const host = createFpInteriorPartitionSolidCollision();
    host.rebuildFromRoots([root]);

    const hits: unknown[] = [];
    host.visitCollisionAabbsInXZ(-2, 2, -2, 2, () => hits.push(1));
    expect(hits.length).toBe(0);
  });
});

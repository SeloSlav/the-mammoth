import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MAMMOTH_FP_INTERIOR_PARTITION_SOLID } from "@the-mammoth/world";
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

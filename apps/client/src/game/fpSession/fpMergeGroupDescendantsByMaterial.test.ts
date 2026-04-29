import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  cloneGeometryForMerge,
  mergeGroupDescendantsByMaterial,
} from "./fpMergeGroupDescendantsByMaterial.js";

describe("mergeGroupDescendantsByMaterial", () => {
  it("merges two meshes sharing one material into a single child mesh", () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    a.position.set(2, 0, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    b.position.set(-1, 3, 0);
    g.add(a, b);
    g.updateMatrixWorld(true);

    mergeGroupDescendantsByMaterial(g);

    expect(g.children.length).toBe(1);
    const m = g.children[0]!;
    expect(m).toBeInstanceOf(THREE.Mesh);
    const mesh = m as THREE.Mesh;
    const pos = mesh.geometry.attributes.position;
    expect(pos).toBeDefined();
    expect(pos!.count).toBeGreaterThan(24);
  });

  it("preserves multi-material meshes without merging them", () => {
    const g = new THREE.Group();
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
      new THREE.MeshStandardMaterial({ color: 0x00ff00 }),
    ];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const multi = new THREE.Mesh(geo, mats);
    g.add(multi);
    g.updateMatrixWorld(true);

    mergeGroupDescendantsByMaterial(g);

    expect(g.children.length).toBe(1);
    expect(g.children[0]).toBe(multi);
  });
});

describe("cloneGeometryForMerge", () => {
  it("converts indexed geometry to non-indexed for merge compatibility", () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    expect(geo.index).not.toBeNull();
    const clone = cloneGeometryForMerge(geo);
    expect(clone.index).toBeNull();
    geo.dispose();
    clone.dispose();
  });
});

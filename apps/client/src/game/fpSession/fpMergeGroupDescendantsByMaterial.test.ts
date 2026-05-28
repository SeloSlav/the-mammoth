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

  it("does not merge interior-tagged geometry with non-interior geometry sharing a material", () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const g = new THREE.Group();
    const interior = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    interior.userData.mammothUnitInterior = true;
    const exterior = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    g.add(interior, exterior);

    mergeGroupDescendantsByMaterial(g);

    expect(g.children.length).toBe(2);
    expect(
      g.children.filter(
        (child) => child instanceof THREE.Mesh && child.userData.mammothUnitInterior === true,
      ),
    ).toHaveLength(1);
  });

  it("does not merge hallway-slab tagged geometry with untagged interior geometry sharing a material", () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    slab.userData.mammothUnitInterior = true;
    slab.userData.mammothCorridorHallwayShell = true;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    wall.userData.mammothUnitInterior = true;
    g.add(slab, wall);

    mergeGroupDescendantsByMaterial(g);

    expect(g.children.length).toBe(2);
    const tagged = g.children.find(
      (child) =>
        child instanceof THREE.Mesh && child.userData.mammothCorridorHallwayShell === true,
    );
    expect(tagged).toBeTruthy();
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

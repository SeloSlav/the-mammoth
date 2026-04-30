import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  attachDroppedPickupGlow,
  createDroppedPickupGlowMaterial,
  stripDroppedPickupGlow,
} from "./droppedItemPickupGlow.js";

const GLOW_NAME = "dropped_pickup_glow_edges";

function countGlowEdges(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if (o.name === GLOW_NAME) n += 1;
  });
  return n;
}

describe("droppedItemPickupGlow", () => {
  it("attaches rim lines to meshes and strip removes them", () => {
    const mat = createDroppedPickupGlowMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));

    attachDroppedPickupGlow(root, mat);
    expect(countGlowEdges(root)).toBeGreaterThan(0);

    stripDroppedPickupGlow(root);
    expect(countGlowEdges(root)).toBe(0);

    mat.dispose();
  });

  it("reuses one EdgesGeometry when submeshes share a BufferGeometry", () => {
    const mat = createDroppedPickupGlowMaterial();
    const root = new THREE.Group();
    const shared = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    root.add(new THREE.Mesh(shared));
    root.add(new THREE.Mesh(shared));

    attachDroppedPickupGlow(root, mat);
    expect(countGlowEdges(root)).toBe(2);

    const edgeGeos = new Set<THREE.BufferGeometry>();
    root.traverse((o) => {
      if (o.name === GLOW_NAME) edgeGeos.add((o as THREE.LineSegments).geometry);
    });
    expect(edgeGeos.size).toBe(1);

    stripDroppedPickupGlow(root);
    expect(countGlowEdges(root)).toBe(0);

    mat.dispose();
    shared.dispose();
  });

  it("uses depth testing on rim material (occluded behind geometry)", () => {
    const mat = createDroppedPickupGlowMaterial();
    expect(mat.depthTest).toBe(true);
    expect(mat.depthWrite).toBe(false);
    mat.dispose();
  });
});

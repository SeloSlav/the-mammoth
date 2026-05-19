import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { expandMeshFrustumBoundsOnce } from "./fpMeshFrustumBounds.js";

describe("expandMeshFrustumBoundsOnce", () => {
  it("inflates bounding sphere radius idempotently", () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const mesh = new THREE.Mesh(geometry);
    geometry.computeBoundingSphere();
    const baseRadius = geometry.boundingSphere!.radius;

    expandMeshFrustumBoundsOnce(mesh, 1.25);
    expandMeshFrustumBoundsOnce(mesh, 1.25);

    expect(geometry.boundingSphere!.radius).toBeCloseTo(baseRadius + 1.25, 5);
  });
});

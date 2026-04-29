import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cabMirrorReflectionWorthUpdating } from "./fpCabMirrorReflectionGate.js";

describe("cabMirrorReflectionWorthUpdating", () => {
  it("returns false when mirror is behind the camera (XZ)", () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 1.6, 0);
    mesh.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 2);
    const forward = new THREE.Vector3(0, 0, 1);
    expect(cabMirrorReflectionWorthUpdating(mesh, cam, forward)).toBe(false);
  });

  it("returns true when mirror is ahead within distance", () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 1.6, 8);
    mesh.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 0);
    const forward = new THREE.Vector3(0, 0, 1);
    expect(cabMirrorReflectionWorthUpdating(mesh, cam, forward)).toBe(true);
  });
});

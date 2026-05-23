import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { measureEditorSelectionMeshStats } from "./editorSelectionMeshStats.js";

describe("measureEditorSelectionMeshStats", () => {
  it("counts indexed box mesh topology", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const stats = measureEditorSelectionMeshStats(root);
    expect(stats.meshCount).toBe(1);
    expect(stats.vertices).toBe(24);
    expect(stats.triangles).toBe(12);
  });

  it("sums multiple meshes under the selection root", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2)));
    const stats = measureEditorSelectionMeshStats(root);
    expect(stats.meshCount).toBe(2);
    expect(stats.triangles).toBe(12 + 2);
  });
});

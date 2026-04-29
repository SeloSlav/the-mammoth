import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { objectLivesUnderScene } from "./sceneGraphUtils.js";

describe("objectLivesUnderScene", () => {
  it("is true for the scene itself", () => {
    const scene = new THREE.Scene();
    expect(objectLivesUnderScene(scene, scene)).toBe(true);
  });

  it("is true for direct and nested children", () => {
    const scene = new THREE.Scene();
    const g = new THREE.Group();
    const mesh = new THREE.Mesh();
    g.add(mesh);
    scene.add(g);
    expect(objectLivesUnderScene(g, scene)).toBe(true);
    expect(objectLivesUnderScene(mesh, scene)).toBe(true);
  });

  it("is false when detached from the scene", () => {
    const scene = new THREE.Scene();
    const orphan = new THREE.Group();
    expect(objectLivesUnderScene(orphan, scene)).toBe(false);
  });
});

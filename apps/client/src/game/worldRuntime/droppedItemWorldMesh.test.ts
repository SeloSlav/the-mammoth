import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildDropMeshLayersFromObject, buildProceduralDropMeshLayers } from "./droppedItemWorldMesh.js";

describe("buildDropMeshLayersFromObject", () => {
  it("merges multi-mesh same-material GLB subtrees into one instanced layer", () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 0.4), mat));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), mat));

    const layers = buildDropMeshLayersFromObject(root, "scrap-metal");
    expect(layers).toHaveLength(1);
    const pos = layers[0]!.geometry.getAttribute("position");
    expect(pos.count).toBeGreaterThan(36);
  });
});

describe("buildProceduralDropMeshLayers", () => {
  it("returns low-poly scrap-metal with far fewer triangles than a typical GLB", () => {
    const layers = buildProceduralDropMeshLayers("scrap-metal");
    expect(layers).not.toBeNull();
    expect(layers!.length).toBeGreaterThan(0);
    const tris = layers!.reduce((sum, layer) => {
      const index = layer.geometry.index;
      const count = index ? index.count : layer.geometry.getAttribute("position").count;
      return sum + count / 3;
    }, 0);
    expect(tris).toBeLessThan(200);
  });
});

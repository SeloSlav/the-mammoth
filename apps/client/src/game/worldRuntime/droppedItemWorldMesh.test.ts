import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getMammothDroppedWorldTargetMaxDimM } from "@the-mammoth/assets";
import { buildDropMeshLayersFromObject, buildProceduralDropMeshLayers } from "./droppedItemWorldMesh.js";

function maxLayerBoundsDim(layers: ReturnType<typeof buildDropMeshLayersFromObject>): number {
  const g = new THREE.Group();
  for (const layer of layers) {
    const m = new THREE.Mesh(layer.geometry, layer.material);
    m.applyMatrix4(layer.localMatrix);
    g.add(m);
  }
  g.updateWorldMatrix(true, true);
  const sz = new THREE.Vector3();
  new THREE.Box3().setFromObject(g).getSize(sz);
  return Math.max(sz.x, sz.y, sz.z);
}

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
    expect(maxLayerBoundsDim(layers)).toBeCloseTo(getMammothDroppedWorldTargetMaxDimM("scrap-metal"), 2);
  });

  it("bakes Meshy-scale GLB proxy to catalog longest edge (screwdriver)", () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1.906, 0.38, 0.415), mat));
    const layers = buildDropMeshLayersFromObject(root, "screwdriver");
    expect(maxLayerBoundsDim(layers)).toBeCloseTo(getMammothDroppedWorldTargetMaxDimM("screwdriver"), 2);
  });
});

describe("buildProceduralDropMeshLayers", () => {
  it("returns null for screwdriver so world drops load the catalog GLB", () => {
    expect(buildProceduralDropMeshLayers("screwdriver")).toBeNull();
  });

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

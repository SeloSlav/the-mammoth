import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getMammothDroppedWorldTargetMaxDimM } from "@the-mammoth/assets";
import {
  buildDropMeshLayersFromObject,
  buildProceduralDropMeshLayers,
  droppedWorldInstancingMaterialFrom,
} from "./droppedItemWorldMesh.js";

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

describe("droppedWorldInstancingMaterialFrom", () => {
  it("converts standard GLB materials to unlit basic for floor instancing", () => {
    const mat = droppedWorldInstancingMaterialFrom(
      new THREE.MeshStandardMaterial({ color: 0xff8800, metalness: 0.9, roughness: 0.2 }),
    );
    expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect((mat as THREE.MeshBasicMaterial).color.getHex()).toBe(0xff8800);
  });
});

describe("buildProceduralDropMeshLayers", () => {
  it("returns null for screwdriver so world drops load the catalog GLB", () => {
    expect(buildProceduralDropMeshLayers("screwdriver")).toBeNull();
  });

  it("returns null for scrap-metal so world drops load the catalog GLB", () => {
    expect(buildProceduralDropMeshLayers("scrap-metal")).toBeNull();
  });

  it("returns null for fuse-wire-pack so world drops load crowbar GLB placeholder", () => {
    expect(buildProceduralDropMeshLayers("fuse-wire-pack")).toBeNull();
  });
});

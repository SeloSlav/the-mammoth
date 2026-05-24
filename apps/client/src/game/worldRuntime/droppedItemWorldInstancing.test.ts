import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { DroppedItem } from "../../module_bindings/types";
import {
  addRowToDefPool,
  createDefInstancedPool,
  removeRowFromDefPool,
  type DefInstancedPool,
} from "./droppedItemWorldInstancing.js";
import type { DropMeshLayer } from "./droppedItemWorldMesh.js";

function mockRow(id: bigint, x: number): DroppedItem {
  return {
    id,
    defId: "apple",
    quantity: 1,
    x,
    y: 0.28,
    z: 0,
    yaw: 0,
    createdAt: { __timestamp_micros_since_unix_epoch__: 0n },
    worldSpawnSlot: undefined,
  } as DroppedItem;
}

describe("DefInstancedPool incremental updates", () => {
  it("swap-removes a middle instance without rebuilding the whole pool", () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const material = new THREE.MeshStandardMaterial();
    const layers: DropMeshLayer[] = [
      { geometry, material, localMatrix: new THREE.Matrix4() },
    ];
    const pool: DefInstancedPool = createDefInstancedPool(layers);

    addRowToDefPool(root, pool, "apple", "1", mockRow(1n, 1));
    addRowToDefPool(root, pool, "apple", "2", mockRow(2n, 2));
    addRowToDefPool(root, pool, "apple", "3", mockRow(3n, 3));
    expect(pool.rows).toHaveLength(3);

    removeRowFromDefPool(pool, "2");
    expect(pool.rows).toHaveLength(2);
    expect(pool.slotByKey.has("2")).toBe(false);
    expect(pool.slotByKey.get("3")).toBe(1);
    expect(pool.meshes[0]!.count).toBe(2);
  });
});

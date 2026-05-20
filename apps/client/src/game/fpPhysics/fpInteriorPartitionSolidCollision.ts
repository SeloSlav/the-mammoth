import type { CollisionAabb } from "@the-mammoth/world";
import { MAMMOTH_FP_INTERIOR_PARTITION_SOLID } from "@the-mammoth/world";
import * as THREE from "three";
import type { DynamicCollisionQueryPose } from "./fpPlayerCollision.js";

function meshEffectiveVisible(mesh: THREE.Mesh): boolean {
  for (let cur: THREE.Object3D | null = mesh; cur; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

export function createFpInteriorPartitionSolidCollision(): {
  rebuildFromRoots: (roots: readonly THREE.Object3D[]) => void;
  visitCollisionAabbsInXZ: (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    _queryPose?: DynamicCollisionQueryPose,
  ) => void;
} {
  const meshes: THREE.Mesh[] = [];
  const scratchBox = new THREE.Box3();

  function rebuildFromRoots(roots: readonly THREE.Object3D[]): void {
    meshes.length = 0;
    for (const root of roots) {
      root.updateMatrixWorld(true);
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.userData[MAMMOTH_FP_INTERIOR_PARTITION_SOLID] !== true) return;
        if (obj.userData.mammothNoCollision === true) return;
        meshes.push(obj);
      });
    }
  }

  function visitCollisionAabbsInXZ(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    _queryPose?: DynamicCollisionQueryPose,
  ): void {
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i]!;
      if (!meshEffectiveVisible(mesh)) continue;

      const g = mesh.geometry;
      if (g.boundingBox == null) g.computeBoundingBox();
      const bb = g.boundingBox;
      if (bb == null || bb.isEmpty()) continue;

      scratchBox.copy(bb).applyMatrix4(mesh.matrixWorld);
      if (scratchBox.max.x <= x0 || scratchBox.min.x >= x1) continue;
      if (scratchBox.max.z <= z0 || scratchBox.min.z >= z1) continue;

      visit({
        min: [scratchBox.min.x, scratchBox.min.y, scratchBox.min.z],
        max: [scratchBox.max.x, scratchBox.max.y, scratchBox.max.z],
      });
    }
  }

  return { rebuildFromRoots, visitCollisionAabbsInXZ };
}

import type { CollisionAabb } from "@the-mammoth/world";
import {
  partitionWallWorldCollisionAabbs,
  type PartitionWallWorldPose,
} from "@the-mammoth/game";
import type { DynamicCollisionQueryPose } from "./fpPlayerCollision.js";

export function createFpInteriorPartitionSolidCollision(): {
  rebuildFromPartitionPoses: (poses: readonly PartitionWallWorldPose[]) => void;
  visitCollisionAabbsInXZ: (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    _queryPose?: DynamicCollisionQueryPose,
  ) => void;
} {
  let aabbs: CollisionAabb[] = [];

  function rebuildFromPartitionPoses(poses: readonly PartitionWallWorldPose[]): void {
    aabbs = poses.flatMap((pose) =>
      partitionWallWorldCollisionAabbs(pose).map(({ min, max }) => ({
        min: [...min] as [number, number, number],
        max: [...max] as [number, number, number],
      })),
    );
  }

  function visitCollisionAabbsInXZ(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    _queryPose?: DynamicCollisionQueryPose,
  ): void {
    for (const aabb of aabbs) {
      if (aabb.max[0] <= x0 || aabb.min[0] >= x1) continue;
      if (aabb.max[2] <= z0 || aabb.min[2] >= z1) continue;
      visit(aabb);
    }
  }

  return { rebuildFromPartitionPoses, visitCollisionAabbsInXZ };
}

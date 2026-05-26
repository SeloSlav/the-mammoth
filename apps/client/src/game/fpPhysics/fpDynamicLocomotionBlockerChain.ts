import {
  visitLocomotionDynamicBlockersInOrder,
  type LocomotionDynamicBlockerSources,
} from "@the-mammoth/game";
import type { CollisionAabb } from "@the-mammoth/world";
import type { DynamicCollisionQueryPose } from "./fpPlayerCollision.js";

export type FpDynamicLocomotionBlockerHost = {
  visitCollisionAabbsInXZ: (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    queryPose?: DynamicCollisionQueryPose,
  ) => void;
};

/** Shared dynamic blocker chain — same source order as server `gather_npc_locomotion_blockers`. */
export function createFpDynamicLocomotionBlockerChain(
  sources: LocomotionDynamicBlockerSources,
): FpDynamicLocomotionBlockerHost {
  return {
    visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose) {
    visitLocomotionDynamicBlockersInOrder(
        sources,
        x0,
        x1,
        z0,
        z1,
        (aabb) => visit({ min: aabb.min, max: aabb.max }),
        queryPose,
      );
    },
  };
}

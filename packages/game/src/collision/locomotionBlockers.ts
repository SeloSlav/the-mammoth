import type { CollisionAabbLike } from "./combatSimArena.js";
import {
  LOCOMOTION_BLOCKER_QUERY_PAD_M,
  LOCOMOTION_STATIC_MIN_BLOCKER_HEIGHT_M,
} from "./fpCapsuleLocomotion.js";

export type LocomotionBlockerQuery = {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
};

/** XZ query window for a capsule move segment — lockstep with server `BlockerQuery`. */
export function locomotionBlockerQueryFromCapsuleMove(
  prevX: number,
  prevZ: number,
  x: number,
  z: number,
  radius: number,
  pad = LOCOMOTION_BLOCKER_QUERY_PAD_M,
): LocomotionBlockerQuery {
  const margin = radius + pad;
  return {
    x0: Math.min(prevX, x) - margin,
    x1: Math.max(prevX, x) + margin,
    z0: Math.min(prevZ, z) - margin,
    z1: Math.max(prevZ, z) + margin,
  };
}

export function locomotionBlockerQueryDisjointAabb(
  query: LocomotionBlockerQuery,
  aabb: CollisionAabbLike,
): boolean {
  return (
    query.x1 < aabb.min[0] ||
    query.x0 > aabb.max[0] ||
    query.z1 < aabb.min[2] ||
    query.z0 > aabb.max[2]
  );
}

export function locomotionVerticalOverlapFeetBody(
  feetY: number,
  bodyHeight: number,
  aabb: CollisionAabbLike,
): boolean {
  const y0 = feetY;
  const y1 = feetY + bodyHeight;
  return y1 > aabb.min[1] + 1e-4 && y0 < aabb.max[1] - 1e-4;
}

export function locomotionStaticBlockerHeightOk(aabb: CollisionAabbLike): boolean {
  return aabb.max[1] - aabb.min[1] >= LOCOMOTION_STATIC_MIN_BLOCKER_HEIGHT_M;
}

/**
 * Authoritative source order for locomotion blockers (static index queried separately on client).
 * Dynamic chain: elevators → apartment doors → interior partitions → peer NPC capsules.
 */
export const LOCOMOTION_DYNAMIC_BLOCKER_SOURCE_ORDER = [
  "elevators",
  "apartmentDoors",
  "interiorPartitions",
  "peerNpcCapsules",
] as const;

export type LocomotionDynamicBlockerSource = (typeof LOCOMOTION_DYNAMIC_BLOCKER_SOURCE_ORDER)[number];

export type LocomotionDynamicBlockerVisitor = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  visit: (aabb: CollisionAabbLike) => void,
  queryPose?: { bodyX: number; bodyFeetY: number; bodyZ: number },
) => void;

export type LocomotionDynamicBlockerSources = Partial<
  Record<LocomotionDynamicBlockerSource, LocomotionDynamicBlockerVisitor | undefined>
>;

/** Visit dynamic blockers in the shared source order. */
export function visitLocomotionDynamicBlockersInOrder(
  sources: LocomotionDynamicBlockerSources,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  visit: (aabb: CollisionAabbLike) => void,
  queryPose?: { bodyX: number; bodyFeetY: number; bodyZ: number },
): void {
  for (const key of LOCOMOTION_DYNAMIC_BLOCKER_SOURCE_ORDER) {
    sources[key]?.(x0, x1, z0, z1, visit, queryPose);
  }
}

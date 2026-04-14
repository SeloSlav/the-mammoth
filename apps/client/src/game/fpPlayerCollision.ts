import type { CollisionAabb, CollisionSpatialIndex } from "@the-mammoth/world";
import type { Vector3 } from "three";

export const FP_PLAYER_COLLISION_RADIUS_M = 0.22;
export const FP_PLAYER_COLLISION_HEIGHT_STAND_M = 1.78;
export const FP_PLAYER_COLLISION_HEIGHT_CROUCH_M = 1.2;

const COLLISION_EPS = 0.0015;
const STEP_IGNORE_BELOW_FEET_M = 0.2;

export type DynamicCollisionAabbSource = {
  visitAabbsInXZ(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
  ): void;
};

function bodyHeight(crouch: boolean): number {
  return crouch ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M : FP_PLAYER_COLLISION_HEIGHT_STAND_M;
}

function verticalOverlap(bodyFeetY: number, height: number, b: CollisionAabb): boolean {
  const y0 = bodyFeetY;
  const y1 = bodyFeetY + height;
  return y1 > b.min[1] + 1e-4 && y0 < b.max[1] - 1e-4;
}

function shouldIgnoreHorizontalBlock(
  bodyFeetY: number,
  stepUpMargin: number,
  b: CollisionAabb,
): boolean {
  return (
    b.max[1] <= bodyFeetY + stepUpMargin + 1e-4 &&
    b.max[1] >= bodyFeetY - STEP_IGNORE_BELOW_FEET_M
  );
}

function visitCandidateAabbs(
  staticIndex: CollisionSpatialIndex,
  dynamicSource: DynamicCollisionAabbSource | undefined,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  visit: (aabb: CollisionAabb) => void,
): void {
  staticIndex.visitAabbsInXZ(x0, x1, z0, z1, (aabb) => visit(aabb));
  dynamicSource?.visitAabbsInXZ(x0, x1, z0, z1, visit);
}

export function resolvePlayerCollisions(
  pos: Vector3,
  prevPos: Readonly<Vector3>,
  vel: Vector3,
  crouch: boolean,
  stepUpMargin: number,
  staticIndex: CollisionSpatialIndex,
  dynamicSource?: DynamicCollisionAabbSource,
): void {
  const radius = FP_PLAYER_COLLISION_RADIUS_M;
  const height = bodyHeight(crouch);

  const resolveX = () => {
    const x0 = Math.min(prevPos.x, pos.x) - radius - COLLISION_EPS;
    const x1 = Math.max(prevPos.x, pos.x) + radius + COLLISION_EPS;
    const z0 = pos.z - radius - COLLISION_EPS;
    const z1 = pos.z + radius + COLLISION_EPS;
    let resolvedX = pos.x;
    visitCandidateAabbs(staticIndex, dynamicSource, x0, x1, z0, z1, (b) => {
      if (!verticalOverlap(pos.y, height, b)) return;
      if (z1 <= b.min[2] || z0 >= b.max[2]) return;
      if (shouldIgnoreHorizontalBlock(pos.y, stepUpMargin, b)) return;
      const bodyMin = resolvedX - radius;
      const bodyMax = resolvedX + radius;
      if (bodyMax <= b.min[0] || bodyMin >= b.max[0]) return;
      const prevMax = prevPos.x + radius;
      const prevMin = prevPos.x - radius;
      if (prevMax <= b.min[0] + COLLISION_EPS) {
        resolvedX = Math.min(resolvedX, b.min[0] - radius - COLLISION_EPS);
        if (vel.x > 0) vel.x = 0;
        return;
      }
      if (prevMin >= b.max[0] - COLLISION_EPS) {
        resolvedX = Math.max(resolvedX, b.max[0] + radius + COLLISION_EPS);
        if (vel.x < 0) vel.x = 0;
        return;
      }
      const pushLo = Math.abs(bodyMax - b.min[0]);
      const pushHi = Math.abs(b.max[0] - bodyMin);
      if (pushLo <= pushHi) {
        resolvedX = Math.min(resolvedX, b.min[0] - radius - COLLISION_EPS);
        if (vel.x > 0) vel.x = 0;
      } else {
        resolvedX = Math.max(resolvedX, b.max[0] + radius + COLLISION_EPS);
        if (vel.x < 0) vel.x = 0;
      }
    });
    pos.x = resolvedX;
  };

  const resolveZ = () => {
    const x0 = pos.x - radius - COLLISION_EPS;
    const x1 = pos.x + radius + COLLISION_EPS;
    const z0 = Math.min(prevPos.z, pos.z) - radius - COLLISION_EPS;
    const z1 = Math.max(prevPos.z, pos.z) + radius + COLLISION_EPS;
    let resolvedZ = pos.z;
    visitCandidateAabbs(staticIndex, dynamicSource, x0, x1, z0, z1, (b) => {
      if (!verticalOverlap(pos.y, height, b)) return;
      if (x1 <= b.min[0] || x0 >= b.max[0]) return;
      if (shouldIgnoreHorizontalBlock(pos.y, stepUpMargin, b)) return;
      const bodyMin = resolvedZ - radius;
      const bodyMax = resolvedZ + radius;
      if (bodyMax <= b.min[2] || bodyMin >= b.max[2]) return;
      const prevMax = prevPos.z + radius;
      const prevMin = prevPos.z - radius;
      if (prevMax <= b.min[2] + COLLISION_EPS) {
        resolvedZ = Math.min(resolvedZ, b.min[2] - radius - COLLISION_EPS);
        if (vel.z > 0) vel.z = 0;
        return;
      }
      if (prevMin >= b.max[2] - COLLISION_EPS) {
        resolvedZ = Math.max(resolvedZ, b.max[2] + radius + COLLISION_EPS);
        if (vel.z < 0) vel.z = 0;
        return;
      }
      const pushLo = Math.abs(bodyMax - b.min[2]);
      const pushHi = Math.abs(b.max[2] - bodyMin);
      if (pushLo <= pushHi) {
        resolvedZ = Math.min(resolvedZ, b.min[2] - radius - COLLISION_EPS);
        if (vel.z > 0) vel.z = 0;
      } else {
        resolvedZ = Math.max(resolvedZ, b.max[2] + radius + COLLISION_EPS);
        if (vel.z < 0) vel.z = 0;
      }
    });
    pos.z = resolvedZ;
  };

  const resolveCeiling = () => {
    if (vel.y <= 0) return;
    const x0 = pos.x - radius - COLLISION_EPS;
    const x1 = pos.x + radius + COLLISION_EPS;
    const z0 = pos.z - radius - COLLISION_EPS;
    const z1 = pos.z + radius + COLLISION_EPS;
    const head = pos.y + height;
    let bestFeet = pos.y;
    visitCandidateAabbs(staticIndex, dynamicSource, x0, x1, z0, z1, (b) => {
      if (x1 <= b.min[0] || x0 >= b.max[0] || z1 <= b.min[2] || z0 >= b.max[2]) return;
      if (head <= b.min[1] + COLLISION_EPS) return;
      if (pos.y >= b.min[1]) return;
      bestFeet = Math.min(bestFeet, b.min[1] - height - COLLISION_EPS);
    });
    if (bestFeet !== pos.y) {
      pos.y = bestFeet;
      if (vel.y > 0) vel.y = 0;
    }
  };

  resolveX();
  resolveZ();
  resolveCeiling();
}

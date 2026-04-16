import type { CollisionAabb, CollisionSpatialIndex } from "@the-mammoth/world";
import { resolveFpCharacterCollisions, type DynamicBlockerSource } from "@the-mammoth/world";
import type { Vector3 } from "three";
import { readFpUseCharacterController } from "./fpCollisionPolicy.js";

export const FP_PLAYER_COLLISION_RADIUS_M = 0.22;
export const FP_PLAYER_COLLISION_HEIGHT_STAND_M = 1.78;
export const FP_PLAYER_COLLISION_HEIGHT_CROUCH_M = 1.2;

const COLLISION_EPS = 0.0015;
const STEP_IGNORE_BELOW_FEET_M = 0.2;
const MAX_HORIZONTAL_COLLISION_SUBSTEP_M = 0.18;

export type DynamicCollisionQueryPose = {
  bodyX: number;
  bodyFeetY: number;
  bodyZ: number;
};

export type DynamicCollisionAabbSource = {
  visitAabbsInXZ(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    queryPose?: DynamicCollisionQueryPose,
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

function sweptVerticalOverlap(
  prevBodyFeetY: number,
  bodyFeetY: number,
  height: number,
  b: CollisionAabb,
): boolean {
  const y0 = Math.min(prevBodyFeetY, bodyFeetY);
  const y1 = Math.max(prevBodyFeetY + height, bodyFeetY + height);
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
  queryPose: DynamicCollisionQueryPose,
  visit: (aabb: CollisionAabb) => void,
): void {
  staticIndex.visitAabbsInXZ(x0, x1, z0, z1, (aabb) => visit(aabb));
  dynamicSource?.visitAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
}

function resolveOverlapAlongAxis(
  resolvedPos: number,
  prevPos: number,
  radius: number,
  minFace: number,
  maxFace: number,
): number {
  const prevMax = prevPos + radius;
  const prevMin = prevPos - radius;
  if (prevMax <= minFace + COLLISION_EPS) {
    return Math.min(resolvedPos, minFace - radius - COLLISION_EPS);
  }
  if (prevMin >= maxFace - COLLISION_EPS) {
    return Math.max(resolvedPos, maxFace + radius + COLLISION_EPS);
  }

  // If we are already overlapping, prefer the side opposite the attempted
  // motion instead of the minimum-penetration side. This prevents thin walls
  // from eventually ejecting the player through the far face while a movement
  // key is held against the wall across many reconciliation steps.
  const axisDelta = resolvedPos - prevPos;
  if (axisDelta > COLLISION_EPS) {
    return Math.min(resolvedPos, minFace - radius - COLLISION_EPS);
  }
  if (axisDelta < -COLLISION_EPS) {
    return Math.max(resolvedPos, maxFace + radius + COLLISION_EPS);
  }

  const mid = (minFace + maxFace) * 0.5;
  return prevPos <= mid
    ? Math.min(resolvedPos, minFace - radius - COLLISION_EPS)
    : Math.max(resolvedPos, maxFace + radius + COLLISION_EPS);
}

function depenetrateHorizontalOverlaps(
  pos: Vector3,
  prevPos: Readonly<Vector3>,
  vel: Vector3,
  height: number,
  stepUpMargin: number,
  staticIndex: CollisionSpatialIndex,
  dynamicSource: DynamicCollisionAabbSource | undefined,
): void {
  const radius = FP_PLAYER_COLLISION_RADIUS_M;
  const maxIterations = 8;
  let overlappedAfterPass = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    overlappedAfterPass = false;
    const x0 = pos.x - radius - COLLISION_EPS;
    const x1 = pos.x + radius + COLLISION_EPS;
    const z0 = pos.z - radius - COLLISION_EPS;
    const z1 = pos.z + radius + COLLISION_EPS;
    visitCandidateAabbs(staticIndex, dynamicSource, x0, x1, z0, z1, {
      bodyX: pos.x,
      bodyFeetY: pos.y,
      bodyZ: pos.z,
    }, (b) => {
      if (!verticalOverlap(pos.y, height, b)) return;
      if (shouldIgnoreHorizontalBlock(pos.y, stepUpMargin, b)) return;
      const bodyMinX = pos.x - radius;
      const bodyMaxX = pos.x + radius;
      const bodyMinZ = pos.z - radius;
      const bodyMaxZ = pos.z + radius;
      const overlapX = Math.min(bodyMaxX - b.min[0], b.max[0] - bodyMinX);
      const overlapZ = Math.min(bodyMaxZ - b.min[2], b.max[2] - bodyMinZ);
      if (overlapX <= 0 || overlapZ <= 0) return;
      overlappedAfterPass = true;
      if (overlapX <= overlapZ) {
        const nextX = resolveOverlapAlongAxis(pos.x, prevPos.x, radius, b.min[0], b.max[0]);
        if (nextX !== pos.x) {
          if (nextX < pos.x && vel.x > 0) vel.x = 0;
          if (nextX > pos.x && vel.x < 0) vel.x = 0;
          pos.x = nextX;
          changed = true;
        }
      } else {
        const nextZ = resolveOverlapAlongAxis(pos.z, prevPos.z, radius, b.min[2], b.max[2]);
        if (nextZ !== pos.z) {
          if (nextZ < pos.z && vel.z > 0) vel.z = 0;
          if (nextZ > pos.z && vel.z < 0) vel.z = 0;
          pos.z = nextZ;
          changed = true;
        }
      }
    });
    if (!changed) break;
  }

  if (!overlappedAfterPass) return;

  const x0 = pos.x - radius - COLLISION_EPS;
  const x1 = pos.x + radius + COLLISION_EPS;
  const z0 = pos.z - radius - COLLISION_EPS;
  const z1 = pos.z + radius + COLLISION_EPS;
  let stillOverlapping = false;
  visitCandidateAabbs(staticIndex, dynamicSource, x0, x1, z0, z1, {
    bodyX: pos.x,
    bodyFeetY: pos.y,
    bodyZ: pos.z,
  }, (b) => {
    if (!verticalOverlap(pos.y, height, b)) return;
    if (shouldIgnoreHorizontalBlock(pos.y, stepUpMargin, b)) return;
    const bodyMinX = pos.x - radius;
    const bodyMaxX = pos.x + radius;
    const bodyMinZ = pos.z - radius;
    const bodyMaxZ = pos.z + radius;
    if (bodyMaxX <= b.min[0] || bodyMinX >= b.max[0]) return;
    if (bodyMaxZ <= b.min[2] || bodyMinZ >= b.max[2]) return;
    stillOverlapping = true;
  });
  if (!stillOverlapping) return;

  pos.x = prevPos.x;
  pos.z = prevPos.z;
  vel.x = 0;
  vel.z = 0;
}

function resolveHorizontalCollisionStep(
  pos: Vector3,
  prevX: number,
  prevY: number,
  prevZ: number,
  vel: Vector3,
  height: number,
  stepUpMargin: number,
  staticIndex: CollisionSpatialIndex,
  dynamicSource: DynamicCollisionAabbSource | undefined,
): void {
  const radius = FP_PLAYER_COLLISION_RADIUS_M;

  const resolveX = () => {
    const x0 = Math.min(prevX, pos.x) - radius - COLLISION_EPS;
    const x1 = Math.max(prevX, pos.x) + radius + COLLISION_EPS;
    const z0 = Math.min(prevZ, pos.z) - radius - COLLISION_EPS;
    const z1 = Math.max(prevZ, pos.z) + radius + COLLISION_EPS;
    let resolvedX = pos.x;
    visitCandidateAabbs(staticIndex, dynamicSource, x0, x1, z0, z1, {
      bodyX: resolvedX,
      bodyFeetY: pos.y,
      bodyZ: pos.z,
    }, (b) => {
      if (!sweptVerticalOverlap(prevY, pos.y, height, b)) return;
      if (z1 <= b.min[2] || z0 >= b.max[2]) return;
      if (shouldIgnoreHorizontalBlock(pos.y, stepUpMargin, b)) return;
      const bodyMin = resolvedX - radius;
      const bodyMax = resolvedX + radius;
      if (bodyMax <= b.min[0] || bodyMin >= b.max[0]) return;
      const nextResolvedX = resolveOverlapAlongAxis(
        resolvedX,
        prevX,
        radius,
        b.min[0],
        b.max[0],
      );
      if (nextResolvedX < resolvedX && vel.x > 0) vel.x = 0;
      if (nextResolvedX > resolvedX && vel.x < 0) vel.x = 0;
      resolvedX = nextResolvedX;
    });
    pos.x = resolvedX;
  };

  const resolveZ = () => {
    const x0 = Math.min(prevX, pos.x) - radius - COLLISION_EPS;
    const x1 = Math.max(prevX, pos.x) + radius + COLLISION_EPS;
    const z0 = Math.min(prevZ, pos.z) - radius - COLLISION_EPS;
    const z1 = Math.max(prevZ, pos.z) + radius + COLLISION_EPS;
    let resolvedZ = pos.z;
    visitCandidateAabbs(staticIndex, dynamicSource, x0, x1, z0, z1, {
      bodyX: pos.x,
      bodyFeetY: pos.y,
      bodyZ: resolvedZ,
    }, (b) => {
      if (!sweptVerticalOverlap(prevY, pos.y, height, b)) return;
      if (x1 <= b.min[0] || x0 >= b.max[0]) return;
      if (shouldIgnoreHorizontalBlock(pos.y, stepUpMargin, b)) return;
      const bodyMin = resolvedZ - radius;
      const bodyMax = resolvedZ + radius;
      if (bodyMax <= b.min[2] || bodyMin >= b.max[2]) return;
      const nextResolvedZ = resolveOverlapAlongAxis(
        resolvedZ,
        prevZ,
        radius,
        b.min[2],
        b.max[2],
      );
      if (nextResolvedZ < resolvedZ && vel.z > 0) vel.z = 0;
      if (nextResolvedZ > resolvedZ && vel.z < 0) vel.z = 0;
      resolvedZ = nextResolvedZ;
    });
    pos.z = resolvedZ;
  };

  const dx = Math.abs(pos.x - prevX);
  const dz = Math.abs(pos.z - prevZ);
  if (dx >= dz) {
    resolveX();
    resolveZ();
  } else {
    resolveZ();
    resolveX();
  }
}

export function resolvePlayerCollisions(
  pos: Vector3,
  prevPos: Readonly<Vector3>,
  vel: Vector3,
  crouch: boolean,
  stepUpMargin: number,
  staticIndex: CollisionSpatialIndex,
  dynamicSource?: DynamicCollisionAabbSource,
  grounded = true,
): void {
  const height = bodyHeight(crouch);
  if (readFpUseCharacterController()) {
    const p = { x: pos.x, y: pos.y, z: pos.z };
    const pv = { x: prevPos.x, y: prevPos.y, z: prevPos.z };
    const v = { x: vel.x, y: vel.y, z: vel.z };
    resolveFpCharacterCollisions({
      pos: p,
      prevPos: pv,
      vel: v,
      bodyHeight: height,
      radius: FP_PLAYER_COLLISION_RADIUS_M,
      stepUpMargin,
      stepUpProbeM: Math.min(0.42, stepUpMargin * 0.5),
      staticIndex,
      dynamicSource: dynamicSource as DynamicBlockerSource | undefined,
      grounded,
    });
    pos.set(p.x, p.y, p.z);
    vel.set(v.x, v.y, v.z);
    return;
  }

  const startX = prevPos.x;
  const startZ = prevPos.z;
  const targetX = pos.x;
  const targetZ = pos.z;
  const maxAxisDelta = Math.max(Math.abs(targetX - startX), Math.abs(targetZ - startZ));
  const stepCount = Math.max(
    1,
    Math.ceil(maxAxisDelta / MAX_HORIZONTAL_COLLISION_SUBSTEP_M),
  );

  let stepPrevX = startX;
  let stepPrevZ = startZ;
  for (let step = 1; step <= stepCount; step++) {
    const u = step / stepCount;
    pos.x = startX + (targetX - startX) * u;
    pos.z = startZ + (targetZ - startZ) * u;
    resolveHorizontalCollisionStep(
      pos,
      stepPrevX,
      prevPos.y,
      stepPrevZ,
      vel,
      height,
      stepUpMargin,
      staticIndex,
      dynamicSource,
    );
    stepPrevX = pos.x;
    stepPrevZ = pos.z;
  }

  depenetrateHorizontalOverlaps(
    pos,
    prevPos,
    vel,
    height,
    stepUpMargin,
    staticIndex,
    dynamicSource,
  );

  const resolveCeiling = () => {
    const radius = FP_PLAYER_COLLISION_RADIUS_M;
    const x0 = pos.x - radius - COLLISION_EPS;
    const x1 = pos.x + radius + COLLISION_EPS;
    const z0 = pos.z - radius - COLLISION_EPS;
    const z1 = pos.z + radius + COLLISION_EPS;
    const head = pos.y + height;
    let bestFeet = pos.y;
    visitCandidateAabbs(staticIndex, dynamicSource, x0, x1, z0, z1, {
      bodyX: pos.x,
      bodyFeetY: pos.y,
      bodyZ: pos.z,
    }, (b) => {
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

  resolveCeiling();
}

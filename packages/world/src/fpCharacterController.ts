import type { CollisionAabb } from "./collisionScene.js";
import type { CollisionSpatialIndex } from "./collisionSpatialIndex.js";

/** Mutable3D vector (no Three.js dependency). */
export type Vec3Like = { x: number; y: number; z: number };

export type DynamicBlockerSource = {
  visitAabbsInXZ(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    queryPose?: { bodyX: number; bodyFeetY: number; bodyZ: number },
  ): void;
};

const COLLISION_EPS = 0.0015;
const STEP_IGNORE_BELOW_FEET_M = 0.2;
export const FP_CHARACTER_MAX_HORIZONTAL_SUBSTEP_M = 0.18;
const SLIDE_PASSES = 4;
const DEPENETRATE_PASSES = 8;
const RAY_EPS = 1e-8;

/** Sync `@the-mammoth/game` `HEAD_CLEARANCE_MIN_CEILING_BOTTOM_ABOVE_FEET_M` + server codegen. */
export const HEAD_CLEARANCE_MIN_CEILING_BOTTOM_ABOVE_FEET_M = 0.5;

function verticalOverlap(feetY: number, bodyH: number, b: CollisionAabb): boolean {
  const y0 = feetY;
  const y1 = feetY + bodyH;
  return y1 > b.min[1] + 1e-4 && y0 < b.max[1] - 1e-4;
}

function sweptVerticalOverlap(
  prevFeetY: number,
  feetY: number,
  bodyH: number,
  b: CollisionAabb,
): boolean {
  const y0 = Math.min(prevFeetY, feetY);
  const y1 = Math.max(prevFeetY + bodyH, feetY + bodyH);
  return y1 > b.min[1] + 1e-4 && y0 < b.max[1] - 1e-4;
}

function shouldIgnoreHorizontalBlock(
  feetY: number,
  stepUpMargin: number,
  b: CollisionAabb,
): boolean {
  return (
    b.max[1] <= feetY + stepUpMargin + 1e-4 &&
    b.max[1] >= feetY - STEP_IGNORE_BELOW_FEET_M
  );
}

/**
 * Segment (ox,oz)->(ox+dx,oz+dz), t in [0,1], clipped to axis-aligned rect in XZ (Liang-Barsky).
 */
function segmentVsRectXZ(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  xmin: number,
  zmin: number,
  xmax: number,
  zmax: number,
): { t0: number; t1: number } | null {
  let u1 = 0;
  let u2 = 1;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < RAY_EPS) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > u2) return false;
      if (r > u1) u1 = r;
    } else {
      if (r < u1) return false;
      if (r < u2) u2 = r;
    }
    return true;
  };

  if (!clip(-dx, ox - xmin)) return null;
  if (!clip(dx, xmax - ox)) return null;
  if (!clip(-dz, oz - zmin)) return null;
  if (!clip(dz, zmax - oz)) return null;

  if (u1 > u2) return null;
  return { t0: u1, t1: u2 };
}

function pointInsideRectXZ(x: number, z: number, x0: number, z0: number, x1: number, z1: number): boolean {
  return x >= x0 - 1e-9 && x <= x1 + 1e-9 && z >= z0 - 1e-9 && z <= z1 + 1e-9;
}

function penetrationNormalXZ(
  ox: number,
  oz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): { nx: number; nz: number } {
  const dl = ox - x0;
  const dr = x1 - ox;
  const db = oz - z0;
  const dt = z1 - oz;
  const m = Math.min(dl, dr, db, dt);
  if (m === dl) return { nx: -1, nz: 0 };
  if (m === dr) return { nx: 1, nz: 0 };
  if (m === db) return { nx: 0, nz: -1 };
  return { nx: 0, nz: 1 };
}

function hitNormalAtXZ(
  px: number,
  pz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  dx: number,
  dz: number,
): { nx: number; nz: number } {
  const faceEps = 1e-4;
  if (Math.abs(px - x0) < faceEps) return { nx: -1, nz: 0 };
  if (Math.abs(px - x1) < faceEps) return { nx: 1, nz: 0 };
  if (Math.abs(pz - z0) < faceEps) return { nx: 0, nz: -1 };
  if (Math.abs(pz - z1) < faceEps) return { nx: 0, nz: 1 };
  if (Math.abs(dx) >= Math.abs(dz)) return { nx: dx > 0 ? -1 : 1, nz: 0 };
  return { nx: 0, nz: dz > 0 ? -1 : 1 };
}

type Hit2D = { t: number; nx: number; nz: number };

function sweepDiscXZVsAabb(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  radius: number,
  b: CollisionAabb,
  feetY: number,
  prevFeetY: number,
  bodyH: number,
  stepUpMargin: number,
): Hit2D | null {
  if (!sweptVerticalOverlap(prevFeetY, feetY, bodyH, b)) return null;
  if (shouldIgnoreHorizontalBlock(feetY, stepUpMargin, b)) return null;

  const x0 = b.min[0] - radius;
  const x1 = b.max[0] + radius;
  const z0 = b.min[2] - radius;
  const z1 = b.max[2] + radius;

  const seg = segmentVsRectXZ(ox, oz, dx, dz, x0, z0, x1, z1);
  if (!seg) return null;
  const { t0, t1 } = seg;
  if (t1 < -1e-9 || t0 > 1 + 1e-9) return null;

  const insideStart = pointInsideRectXZ(ox, oz, x0, z0, x1, z1);
  if (insideStart) {
    const { nx, nz } = penetrationNormalXZ(ox, oz, x0, z0, x1, z1);
    return { t: 0, nx, nz };
  }

  let tHit = t0;
  if (tHit < 0) tHit = 0;
  if (tHit > 1) return null;

  const px = ox + dx * tHit;
  const pz = oz + dz * tHit;
  const { nx, nz } = hitNormalAtXZ(px, pz, x0, z0, x1, z1, dx, dz);
  return { t: tHit, nx, nz };
}

function visitCandidateBlockers(
  staticIndex: CollisionSpatialIndex,
  dynamicSource: DynamicBlockerSource | undefined,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  queryPose: { bodyX: number; bodyFeetY: number; bodyZ: number },
  visit: (aabb: CollisionAabb) => void,
): void {
  staticIndex.visitAabbsInXZ(x0, x1, z0, z1, (aabb) => visit(aabb));
  dynamicSource?.visitAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
}

function findClosestHitAlongMove(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  radius: number,
  feetY: number,
  prevFeetY: number,
  bodyH: number,
  stepUpMargin: number,
  staticIndex: CollisionSpatialIndex,
  dynamicSource: DynamicBlockerSource | undefined,
): Hit2D | null {
  const pad = radius + COLLISION_EPS;
  const x0 = Math.min(ox, ox + dx) - pad;
  const x1 = Math.max(ox, ox + dx) + pad;
  const z0 = Math.min(oz, oz + dz) - pad;
  const z1 = Math.max(oz, oz + dz) + pad;

  let best: Hit2D | null = null;
  const q = { bodyX: ox, bodyFeetY: feetY, bodyZ: oz };
  visitCandidateBlockers(staticIndex, dynamicSource, x0, x1, z0, z1, q, (b) => {
    const h = sweepDiscXZVsAabb(ox, oz, dx, dz, radius, b, feetY, prevFeetY, bodyH, stepUpMargin);
    if (!h) return;
    if (!best || h.t < best.t - 1e-9) {
      best = h;
    }
  });
  return best;
}

function slideMoveXZ(
  px: number,
  pz: number,
  tx: number,
  tz: number,
  feetY: number,
  prevFeetY: number,
  bodyH: number,
  stepUpMargin: number,
  radius: number,
  staticIndex: CollisionSpatialIndex,
  dynamicSource: DynamicBlockerSource | undefined,
  vel: Vec3Like,
): { x: number; z: number } {
  let rx = tx - px;
  let rz = tz - pz;
  let cx = px;
  let cz = pz;

  for (let pass = 0; pass < SLIDE_PASSES; pass++) {
    const len = Math.hypot(rx, rz);
    if (len < 1e-8) break;

    const hit = findClosestHitAlongMove(
      cx,
      cz,
      rx,
      rz,
      radius,
      feetY,
      prevFeetY,
      bodyH,
      stepUpMargin,
      staticIndex,
      dynamicSource,
    );

    if (!hit || hit.t > 1 - 1e-9) {
      cx += rx;
      cz += rz;
      break;
    }

    if (hit.t < 1e-7) {
      const nudge = COLLISION_EPS * 6;
      cx += hit.nx * nudge;
      cz += hit.nz * nudge;
      continue;
    }

    const t = Math.max(0, Math.min(1, hit.t - 1e-6));
    cx += rx * t;
    cz += rz * t;

    const { nx, nz } = hit;
    const into = vel.x * nx + vel.z * nz;
    if (into < 0) {
      vel.x -= into * nx;
      vel.z -= into * nz;
    }

    const remx = rx * (1 - t);
    const remz = rz * (1 - t);
    const slideDot = remx * nx + remz * nz;
    rx = remx - slideDot * nx;
    rz = remz - slideDot * nz;
  }

  return { x: cx, z: cz };
}

function depenetrateHorizontalOverlaps(
  pos: Vec3Like,
  prevPos: Vec3Like,
  vel: Vec3Like,
  height: number,
  stepUpMargin: number,
  radius: number,
  staticIndex: CollisionSpatialIndex,
  dynamicSource: DynamicBlockerSource | undefined,
): void {
  const maxIterations = 8;
  let overlappedAfterPass = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    overlappedAfterPass = false;
    const x0 = pos.x - radius - COLLISION_EPS;
    const x1 = pos.x + radius + COLLISION_EPS;
    const z0 = pos.z - radius - COLLISION_EPS;
    const z1 = pos.z + radius + COLLISION_EPS;
    const q = { bodyX: pos.x, bodyFeetY: pos.y, bodyZ: pos.z };
    visitCandidateBlockers(staticIndex, dynamicSource, x0, x1, z0, z1, q, (b) => {
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
        const prevMax = prevPos.x + radius;
        const prevMin = prevPos.x - radius;
        let nextX = pos.x;
        if (prevMax <= b.min[0] + COLLISION_EPS) {
          nextX = Math.min(pos.x, b.min[0] - radius - COLLISION_EPS);
        } else if (prevMin >= b.max[0] - COLLISION_EPS) {
          nextX = Math.max(pos.x, b.max[0] + radius + COLLISION_EPS);
        } else {
          const axisDelta = pos.x - prevPos.x;
          if (axisDelta > COLLISION_EPS) nextX = Math.min(pos.x, b.min[0] - radius - COLLISION_EPS);
          else if (axisDelta < -COLLISION_EPS) nextX = Math.max(pos.x, b.max[0] + radius + COLLISION_EPS);
          else {
            const mid = (b.min[0] + b.max[0]) * 0.5;
            nextX =
              prevPos.x <= mid
                ? Math.min(pos.x, b.min[0] - radius - COLLISION_EPS)
                : Math.max(pos.x, b.max[0] + radius + COLLISION_EPS);
          }
        }
        if (nextX !== pos.x) {
          if (nextX < pos.x && vel.x > 0) vel.x = 0;
          if (nextX > pos.x && vel.x < 0) vel.x = 0;
          pos.x = nextX;
          changed = true;
        }
      } else {
        const prevMax = prevPos.z + radius;
        const prevMin = prevPos.z - radius;
        let nextZ = pos.z;
        if (prevMax <= b.min[2] + COLLISION_EPS) {
          nextZ = Math.min(pos.z, b.min[2] - radius - COLLISION_EPS);
        } else if (prevMin >= b.max[2] - COLLISION_EPS) {
          nextZ = Math.max(pos.z, b.max[2] + radius + COLLISION_EPS);
        } else {
          const axisDelta = pos.z - prevPos.z;
          if (axisDelta > COLLISION_EPS) nextZ = Math.min(pos.z, b.min[2] - radius - COLLISION_EPS);
          else if (axisDelta < -COLLISION_EPS) nextZ = Math.max(pos.z, b.max[2] + radius + COLLISION_EPS);
          else {
            const mid = (b.min[2] + b.max[2]) * 0.5;
            nextZ =
              prevPos.z <= mid
                ? Math.min(pos.z, b.min[2] - radius - COLLISION_EPS)
                : Math.max(pos.z, b.max[2] + radius + COLLISION_EPS);
          }
        }
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
  const q2 = { bodyX: pos.x, bodyFeetY: pos.y, bodyZ: pos.z };
  visitCandidateBlockers(staticIndex, dynamicSource, x0, x1, z0, z1, q2, (b) => {
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

export type ResolveFpCharacterCollisionOpts = {
  pos: Vec3Like;
  prevPos: Vec3Like;
  vel: Vec3Like;
  bodyHeight: number;
  radius: number;
  stepUpMargin: number;
  /** Auto-step height try (m);0 disables. */
  stepUpProbeM: number;
  staticIndex: CollisionSpatialIndex;
  dynamicSource?: DynamicBlockerSource;
  grounded: boolean;
};

/**
 * FPS-style horizontal resolution: substeps + swept disc vs blockers + multi-pass sliding,
 * then depenetration + ceiling clamp. Replaces axis-separated resolution for tighter corridors.
 */
export function resolveFpCharacterCollisions(opts: ResolveFpCharacterCollisionOpts): void {
  const {
    pos,
    prevPos,
    vel,
    bodyHeight,
    radius,
    stepUpMargin,
    stepUpProbeM,
    staticIndex,
    dynamicSource,
    grounded,
  } = opts;

  const startX = prevPos.x;
  const startZ = prevPos.z;
  const targetX = pos.x;
  const targetZ = pos.z;
  const maxAxisDelta = Math.max(Math.abs(targetX - startX), Math.abs(targetZ - startZ));
  const stepCount = Math.max(
    1,
    Math.ceil(maxAxisDelta / FP_CHARACTER_MAX_HORIZONTAL_SUBSTEP_M),
  );

  let stepPrevX = startX;
  let stepPrevZ = startZ;
  for (let step = 1; step <= stepCount; step++) {
    const u = step / stepCount;
    const subTx = startX + (targetX - startX) * u;
    const subTz = startZ + (targetZ - startZ) * u;

    const trySlideAtFeetY = (feetY: number, prevFeetY: number) =>
      slideMoveXZ(
        stepPrevX,
        stepPrevZ,
        subTx,
        subTz,
        feetY,
        prevFeetY,
        bodyHeight,
        stepUpMargin,
        radius,
        staticIndex,
        dynamicSource,
        vel,
      );

    let out = trySlideAtFeetY(pos.y, prevPos.y);
    if (
      grounded &&
      stepUpProbeM > 1e-6 &&
      (Math.abs(out.x - subTx) > 1e-4 || Math.abs(out.z - subTz) > 1e-4)
    ) {
      const raisedY = pos.y + stepUpProbeM;
      const outStep = slideMoveXZ(
        stepPrevX,
        stepPrevZ,
        subTx,
        subTz,
        raisedY,
        prevPos.y,
        bodyHeight,
        stepUpMargin,
        radius,
        staticIndex,
        dynamicSource,
        vel,
      );
      const reached =
        Math.abs(outStep.x - subTx) < 1e-4 && Math.abs(outStep.z - subTz) < 1e-4;
      if (reached) {
        pos.y = raisedY;
        out = outStep;
      }
    }

    pos.x = out.x;
    pos.z = out.z;
    stepPrevX = pos.x;
    stepPrevZ = pos.z;
  }

  depenetrateHorizontalOverlaps(
    pos,
    prevPos,
    vel,
    bodyHeight,
    stepUpMargin,
    radius,
    staticIndex,
    dynamicSource,
  );

  // Always enforce standing headroom after support snapping / step-up. Descending stairs can leave
  // the feet too high under a thin landing whose top is still inside the step-ignore band, so a
  // jump-only ceiling pass lets the head clip into the overhead slab.
  {
    const x0 = pos.x - radius - COLLISION_EPS;
    const x1 = pos.x + radius + COLLISION_EPS;
    const z0 = pos.z - radius - COLLISION_EPS;
    const z1 = pos.z + radius + COLLISION_EPS;
    const head = pos.y + bodyHeight;
    let bestFeet = pos.y;
    const qc = { bodyX: pos.x, bodyFeetY: pos.y, bodyZ: pos.z };
    visitCandidateBlockers(staticIndex, dynamicSource, x0, x1, z0, z1, qc, (b) => {
      if (x1 <= b.min[0] || x0 >= b.max[0] || z1 <= b.min[2] || z0 >= b.max[2]) return;
      if (head <= b.min[1] + COLLISION_EPS) return;
      if (pos.y >= b.min[1]) return;
      // Wall-vs-ceiling gate: a tall vertical wall (e.g. landing exterior door slab whose bottom
      // sits just above feet level) would otherwise snap feet a full body-height down here.
      if (b.min[1] < pos.y + HEAD_CLEARANCE_MIN_CEILING_BOTTOM_ABOVE_FEET_M) return;
      bestFeet = Math.min(bestFeet, b.min[1] - bodyHeight - COLLISION_EPS);
    });
    if (bestFeet !== pos.y) {
      pos.y = bestFeet;
      if (vel.y > 0) vel.y = 0;
    }
  }
}

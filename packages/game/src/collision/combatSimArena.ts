/** Combat-sim arena shell — keep `apps/server/src/generated_collision_constants.rs` aligned via codegen. */

import {
  FP_WALK_FOOT_RADIUS_XZ_M,
  FP_WALK_PROBE_DY_M,
  sampleGroundedWalkTopFromSlabs,
  sampleWalkTopFromSlabs,
} from "./walkSurfaceReach.js";

export const COMBAT_SIM_FALLBACK_HALF_EXTENT_M = 14;
export const COMBAT_SIM_ARENA_PAD_M = 6;
export const COMBAT_SIM_WALL_HEIGHT_M = 4;
export const COMBAT_SIM_WALL_THICKNESS_M = 0.35;

/** Walk tread thickness — matches megablock stair slab inflation. */
export const COMBAT_SIM_WALK_TREAD_THICK_M = 0.11;
export const COMBAT_SIM_WALK_SEAM_PAD_XZ_M = 0.075;
export const COMBAT_SIM_WALK_SEAM_PAD_Y_HI_M = 0.095;

export type CombatSimArenaBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  footY: number;
};

export type CombatSimObstacleSpec = {
  /** Offset from arena center (m). */
  centerOffsetX: number;
  centerOffsetZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
};

/** Cover volumes in the combat arena — mirrored on the server for NPC locomotion. */
export const COMBAT_SIM_AUTHORED_OBSTACLES: readonly CombatSimObstacleSpec[] = [
  { centerOffsetX: -5, centerOffsetZ: 0, sizeX: 1.2, sizeY: 2.4, sizeZ: 1.2 },
  { centerOffsetX: 5, centerOffsetZ: -2.5, sizeX: 1, sizeY: 2, sizeZ: 2 },
  { centerOffsetX: 0, centerOffsetZ: 5.5, sizeX: 2.5, sizeY: 2.2, sizeZ: 0.8 },
  { centerOffsetX: -2, centerOffsetZ: 4, sizeX: 1.5, sizeY: 1.8, sizeZ: 1.5 },
  { centerOffsetX: 3, centerOffsetZ: -6, sizeX: 2, sizeY: 1.5, sizeZ: 0.9 },
];

export type CombatSimStepStackSpec = {
  centerOffsetX: number;
  centerOffsetZ: number;
  widthX: number;
  depthZ: number;
  stepCount: number;
  stepRiseM: number;
  climbDirX: number;
  climbDirZ: number;
};

/** Narrow stair stacks — ladder-like vertical chase lines. */
export const COMBAT_SIM_STEP_STACKS: readonly CombatSimStepStackSpec[] = [
  {
    centerOffsetX: -7.5,
    centerOffsetZ: -5,
    widthX: 1.6,
    depthZ: 3.4,
    stepCount: 5,
    stepRiseM: 0.28,
    climbDirX: 0,
    climbDirZ: 1,
  },
  {
    centerOffsetX: 5.5,
    centerOffsetZ: 7,
    widthX: 1.3,
    depthZ: 2.6,
    stepCount: 4,
    stepRiseM: 0.3,
    climbDirX: 0,
    climbDirZ: -1,
  },
];

export type CombatSimRampSpec = {
  centerOffsetX: number;
  centerOffsetZ: number;
  widthX: number;
  lengthZ: number;
  riseM: number;
  climbDirX: number;
  climbDirZ: number;
  segmentCount: number;
};

export const COMBAT_SIM_RAMPS: readonly CombatSimRampSpec[] = [
  {
    centerOffsetX: 7.5,
    centerOffsetZ: -2,
    widthX: 2.8,
    lengthZ: 5.2,
    riseM: 1.3,
    climbDirX: -1,
    climbDirZ: 0,
    segmentCount: 10,
  },
];

export type CombatSimDeckSpec = {
  centerOffsetX: number;
  centerOffsetZ: number;
  widthX: number;
  depthZ: number;
  topAboveFootYM: number;
};

/** Raised platforms at the top of ramps / stair stacks. */
export const COMBAT_SIM_DECKS: readonly CombatSimDeckSpec[] = [
  { centerOffsetX: -7.5, centerOffsetZ: -0.8, widthX: 3, depthZ: 2.8, topAboveFootYM: 1.4 },
  { centerOffsetX: 7.5, centerOffsetZ: 2.5, widthX: 2.6, depthZ: 2.4, topAboveFootYM: 1.3 },
];

export type CombatSimLowWallSpec = {
  centerOffsetX: number;
  centerOffsetZ: number;
  lengthM: number;
  heightM: number;
  thicknessM: number;
  yawRad: number;
};

export const COMBAT_SIM_LOW_WALLS: readonly CombatSimLowWallSpec[] = [
  { centerOffsetX: 0, centerOffsetZ: 8.5, lengthM: 6, heightM: 1.35, thicknessM: 0.35, yawRad: 0 },
  { centerOffsetX: -9, centerOffsetZ: 5, lengthM: 4.5, heightM: 1.2, thicknessM: 0.35, yawRad: Math.PI / 2 },
];

export type CollisionAabbLike = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
};

function normalizeClimbDir(x: number, z: number): { x: number; z: number } {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: 1 };
  return { x: x / len, z: z / len };
}

function orientedFootprintAabb(
  centerX: number,
  centerZ: number,
  rightX: number,
  rightZ: number,
  climbX: number,
  climbZ: number,
  halfWidth: number,
  alongMin: number,
  alongMax: number,
  minY: number,
  maxY: number,
): CollisionAabbLike {
  const corners: readonly [number, number][] = [
    [-halfWidth, alongMin],
    [halfWidth, alongMin],
    [halfWidth, alongMax],
    [-halfWidth, alongMax],
  ];
  let minx = Infinity;
  let maxx = -Infinity;
  let minz = Infinity;
  let maxz = -Infinity;
  for (const [right, along] of corners) {
    const wx = centerX + rightX * right + climbX * along;
    const wz = centerZ + rightZ * right + climbZ * along;
    minx = Math.min(minx, wx);
    maxx = Math.max(maxx, wx);
    minz = Math.min(minz, wz);
    maxz = Math.max(maxz, wz);
  }
  return {
    min: [minx, minY, minz],
    max: [maxx, maxY, maxz],
  };
}

function inflateWalkSeam(aabb: CollisionAabbLike): CollisionAabbLike {
  const pad = COMBAT_SIM_WALK_SEAM_PAD_XZ_M;
  return {
    min: [aabb.min[0] - pad, aabb.min[1], aabb.min[2] - pad],
    max: [aabb.max[0] + pad, aabb.max[1] + COMBAT_SIM_WALK_SEAM_PAD_Y_HI_M, aabb.max[2] + pad],
  };
}

function arenaCenterXZ(bounds: CombatSimArenaBounds): { cx: number; cz: number } {
  return {
    cx: (bounds.minX + bounds.maxX) * 0.5,
    cz: (bounds.minZ + bounds.maxZ) * 0.5,
  };
}

function appendStepStackGeometry(
  bounds: CombatSimArenaBounds,
  spec: CombatSimStepStackSpec,
  collisionOut: CollisionAabbLike[],
  walkOut: CollisionAabbLike[],
): void {
  const { cx, cz } = arenaCenterXZ(bounds);
  const centerX = cx + spec.centerOffsetX;
  const centerZ = cz + spec.centerOffsetZ;
  const climb = normalizeClimbDir(spec.climbDirX, spec.climbDirZ);
  const rightX = -climb.z;
  const rightZ = climb.x;
  const halfW = spec.widthX * 0.5;
  const treadDepth = spec.depthZ / spec.stepCount;

  for (let i = 0; i < spec.stepCount; i++) {
    const yBottom = bounds.footY + i * spec.stepRiseM;
    const yTop = bounds.footY + (i + 1) * spec.stepRiseM;
    const alongMin = -spec.depthZ * 0.5 + i * treadDepth;
    const alongMax = alongMin + treadDepth;
    collisionOut.push(
      orientedFootprintAabb(
        centerX,
        centerZ,
        rightX,
        rightZ,
        climb.x,
        climb.z,
        halfW,
        alongMin,
        alongMax,
        yBottom,
        yTop,
      ),
    );
    walkOut.push(
      inflateWalkSeam(
        orientedFootprintAabb(
          centerX,
          centerZ,
          rightX,
          rightZ,
          climb.x,
          climb.z,
          halfW,
          alongMin,
          alongMax,
          yTop - COMBAT_SIM_WALK_TREAD_THICK_M,
          yTop,
        ),
      ),
    );
  }
}

function appendRampGeometry(
  bounds: CombatSimArenaBounds,
  spec: CombatSimRampSpec,
  collisionOut: CollisionAabbLike[],
  walkOut: CollisionAabbLike[],
): void {
  const { cx, cz } = arenaCenterXZ(bounds);
  const centerX = cx + spec.centerOffsetX;
  const centerZ = cz + spec.centerOffsetZ;
  const climb = normalizeClimbDir(spec.climbDirX, spec.climbDirZ);
  const rightX = -climb.z;
  const rightZ = climb.x;
  const halfW = spec.widthX * 0.5;

  for (let j = 0; j < spec.segmentCount; j++) {
    const t0 = j / spec.segmentCount;
    const t1 = (j + 1) / spec.segmentCount;
    const y0 = bounds.footY + t0 * spec.riseM;
    const y1 = bounds.footY + t1 * spec.riseM;
    const alongMin = -spec.lengthZ * 0.5 + t0 * spec.lengthZ;
    const alongMax = -spec.lengthZ * 0.5 + t1 * spec.lengthZ;
    collisionOut.push(
      orientedFootprintAabb(
        centerX,
        centerZ,
        rightX,
        rightZ,
        climb.x,
        climb.z,
        halfW,
        alongMin,
        alongMax,
        y0,
        y1,
      ),
    );
    walkOut.push(
      inflateWalkSeam(
        orientedFootprintAabb(
          centerX,
          centerZ,
          rightX,
          rightZ,
          climb.x,
          climb.z,
          halfW,
          alongMin,
          alongMax,
          y1 - COMBAT_SIM_WALK_TREAD_THICK_M,
          y1,
        ),
      ),
    );
  }
}

function appendDeckGeometry(
  bounds: CombatSimArenaBounds,
  spec: CombatSimDeckSpec,
  collisionOut: CollisionAabbLike[],
  walkOut: CollisionAabbLike[],
): void {
  const { cx, cz } = arenaCenterXZ(bounds);
  const centerX = cx + spec.centerOffsetX;
  const centerZ = cz + spec.centerOffsetZ;
  const yTop = bounds.footY + spec.topAboveFootYM;
  const halfX = spec.widthX * 0.5;
  const halfZ = spec.depthZ * 0.5;
  collisionOut.push({
    min: [centerX - halfX, bounds.footY, centerZ - halfZ],
    max: [centerX + halfX, yTop, centerZ + halfZ],
  });
  walkOut.push(
    inflateWalkSeam({
      min: [centerX - halfX, yTop - COMBAT_SIM_WALK_TREAD_THICK_M, centerZ - halfZ],
      max: [centerX + halfX, yTop, centerZ + halfZ],
    }),
  );
}

function appendLowWallGeometry(
  bounds: CombatSimArenaBounds,
  spec: CombatSimLowWallSpec,
  collisionOut: CollisionAabbLike[],
): void {
  const { cx, cz } = arenaCenterXZ(bounds);
  const centerX = cx + spec.centerOffsetX;
  const centerZ = cz + spec.centerOffsetZ;
  const cos = Math.cos(spec.yawRad);
  const sin = Math.sin(spec.yawRad);
  const halfLen = spec.lengthM * 0.5;
  const halfT = spec.thicknessM * 0.5;
  const yTop = bounds.footY + spec.heightM;
  const localCorners: readonly [number, number][] = [
    [-halfLen, -halfT],
    [halfLen, -halfT],
    [halfLen, halfT],
    [-halfLen, halfT],
  ];
  let minx = Infinity;
  let maxx = -Infinity;
  let minz = Infinity;
  let maxz = -Infinity;
  for (const [lx, lz] of localCorners) {
    const wx = centerX + lx * cos - lz * sin;
    const wz = centerZ + lx * sin + lz * cos;
    minx = Math.min(minx, wx);
    maxx = Math.max(maxx, wx);
    minz = Math.min(minz, wz);
    maxz = Math.max(maxz, wz);
  }
  collisionOut.push({
    min: [minx, bounds.footY, minz],
    max: [maxx, yTop, maxz],
  });
}

export function combatSimArenaBoundsFromUnitFootprint(args: {
  boundMinX: number;
  boundMaxX: number;
  boundMinZ: number;
  boundMaxZ: number;
  footY: number;
}): CombatSimArenaBounds {
  return {
    minX: args.boundMinX - COMBAT_SIM_ARENA_PAD_M,
    maxX: args.boundMaxX + COMBAT_SIM_ARENA_PAD_M,
    minZ: args.boundMinZ - COMBAT_SIM_ARENA_PAD_M,
    maxZ: args.boundMaxZ + COMBAT_SIM_ARENA_PAD_M,
    footY: args.footY,
  };
}

export function combatSimArenaPerimeterWallAabbs(
  bounds: CombatSimArenaBounds,
): CollisionAabbLike[] {
  const { minX, maxX, minZ, maxZ, footY } = bounds;
  const wallY1 = footY + COMBAT_SIM_WALL_HEIGHT_M;
  const t = COMBAT_SIM_WALL_THICKNESS_M;
  return [
    { min: [minX, footY, minZ], max: [minX + t, wallY1, maxZ] },
    { min: [maxX - t, footY, minZ], max: [maxX, wallY1, maxZ] },
    { min: [minX, footY, minZ], max: [maxX, wallY1, minZ + t] },
    { min: [minX, footY, maxZ - t], max: [maxX, wallY1, maxZ] },
  ];
}

export function combatSimArenaObstacleAabbs(bounds: CombatSimArenaBounds): CollisionAabbLike[] {
  const { cx, cz } = arenaCenterXZ(bounds);
  const out: CollisionAabbLike[] = [];
  for (const spec of COMBAT_SIM_AUTHORED_OBSTACLES) {
    const ox = cx + spec.centerOffsetX;
    const oz = cz + spec.centerOffsetZ;
    const hx = spec.sizeX * 0.5;
    const hy = spec.sizeY;
    const hz = spec.sizeZ * 0.5;
    out.push({
      min: [ox - hx, bounds.footY, oz - hz],
      max: [ox + hx, bounds.footY + hy, oz + hz],
    });
  }
  return out;
}

export function combatSimArenaObstacleWalkAabbs(bounds: CombatSimArenaBounds): CollisionAabbLike[] {
  const obstacles = combatSimArenaObstacleAabbs(bounds);
  const out: CollisionAabbLike[] = [];
  for (const aabb of obstacles) {
    const yTop = aabb.max[1];
    out.push(
      inflateWalkSeam({
        min: [aabb.min[0], yTop - COMBAT_SIM_WALK_TREAD_THICK_M, aabb.min[2]],
        max: [aabb.max[0], yTop, aabb.max[2]],
      }),
    );
  }
  return out;
}

export function combatSimArenaTerrainCollisionAabbs(bounds: CombatSimArenaBounds): CollisionAabbLike[] {
  const out: CollisionAabbLike[] = [];
  for (const spec of COMBAT_SIM_STEP_STACKS) {
    appendStepStackGeometry(bounds, spec, out, []);
  }
  for (const spec of COMBAT_SIM_RAMPS) {
    appendRampGeometry(bounds, spec, out, []);
  }
  for (const spec of COMBAT_SIM_DECKS) {
    appendDeckGeometry(bounds, spec, out, []);
  }
  for (const spec of COMBAT_SIM_LOW_WALLS) {
    appendLowWallGeometry(bounds, spec, out);
  }
  return out;
}

export function combatSimArenaWalkSurfaceAabbs(bounds: CombatSimArenaBounds): CollisionAabbLike[] {
  const floorWalk: CollisionAabbLike = {
    min: [bounds.minX, bounds.footY - 0.12, bounds.minZ],
    max: [bounds.maxX, bounds.footY, bounds.maxZ],
  };
  const walkOut: CollisionAabbLike[] = [floorWalk];
  for (const spec of COMBAT_SIM_STEP_STACKS) {
    appendStepStackGeometry(bounds, spec, [], walkOut);
  }
  for (const spec of COMBAT_SIM_RAMPS) {
    appendRampGeometry(bounds, spec, [], walkOut);
  }
  for (const spec of COMBAT_SIM_DECKS) {
    appendDeckGeometry(bounds, spec, [], walkOut);
  }
  walkOut.push(...combatSimArenaObstacleWalkAabbs(bounds));
  return walkOut;
}

export function combatSimArenaCollisionAabbs(bounds: CombatSimArenaBounds): CollisionAabbLike[] {
  const floorWalk: CollisionAabbLike = {
    min: [bounds.minX, bounds.footY - 0.12, bounds.minZ],
    max: [bounds.maxX, bounds.footY, bounds.maxZ],
  };
  return [
    floorWalk,
    ...combatSimArenaPerimeterWallAabbs(bounds),
    ...combatSimArenaObstacleAabbs(bounds),
    ...combatSimArenaTerrainCollisionAabbs(bounds),
  ];
}

/** Sample highest walk top under probe feet — mirrors client walk spatial index rules. */
export function combatSimSampleWalkTopY(
  bounds: CombatSimArenaBounds,
  x: number,
  z: number,
  probeFeetY: number,
): number {
  const slabs = combatSimArenaWalkSurfaceAabbs(bounds);
  const probeTopY = probeFeetY + FP_WALK_PROBE_DY_M;
  const top = sampleWalkTopFromSlabs(slabs, x, z, probeFeetY, probeTopY, {
    footRadiusXZ: FP_WALK_FOOT_RADIUS_XZ_M,
  });
  if (Number.isFinite(top)) return top;
  return sampleGroundedWalkTopFromSlabs(slabs, x, z, probeFeetY, bounds.footY, {
    footRadiusXZ: FP_WALK_FOOT_RADIUS_XZ_M,
  });
}

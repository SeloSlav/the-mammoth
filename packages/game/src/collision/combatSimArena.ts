/** Combat-sim arena shell — keep `apps/server/src/generated_collision_constants.rs` aligned via codegen. */

import {
  FP_WALK_FOOT_RADIUS_XZ_M,
  FP_WALK_PROBE_DY_M,
  sampleGroundedWalkTopFromSlabs,
  sampleWalkTopFromSlabs,
} from "./walkSurfaceReach.js";

export const COMBAT_SIM_FALLBACK_HALF_EXTENT_M = 28;
export const COMBAT_SIM_ARENA_PAD_M = 6;
export const COMBAT_SIM_WALL_HEIGHT_M = 4;
export const COMBAT_SIM_WALL_THICKNESS_M = 0.35;

/** Walk tread thickness — matches megablock stair slab inflation. */
export const COMBAT_SIM_WALK_TREAD_THICK_M = 0.11;
export const COMBAT_SIM_WALK_SEAM_PAD_XZ_M = 0.075;
export const COMBAT_SIM_WALK_SEAM_PAD_Y_HI_M = 0.095;
/** Raised platform collision/visual thickness — open underneath (no pillar overlap with stairs). */
export const COMBAT_SIM_DECK_SLAB_THICK_M = 0.22;

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

/** Cover volumes — spread around the doubled arena; keep clear of stair/ramp lanes. */
export const COMBAT_SIM_AUTHORED_OBSTACLES: readonly CombatSimObstacleSpec[] = [
  { centerOffsetX: -10, centerOffsetZ: -6, sizeX: 1.4, sizeY: 2.4, sizeZ: 1.4 },
  { centerOffsetX: 12, centerOffsetZ: -14, sizeX: 1.2, sizeY: 2, sizeZ: 2.2 },
  { centerOffsetX: 6, centerOffsetZ: 10, sizeX: 2.8, sizeY: 2.2, sizeZ: 1 },
  { centerOffsetX: -14, centerOffsetZ: 12, sizeX: 1.8, sizeY: 1.8, sizeZ: 1.8 },
  { centerOffsetX: 14, centerOffsetZ: 6, sizeX: 2, sizeY: 1.5, sizeZ: 1.1 },
  { centerOffsetX: 0, centerOffsetZ: -22, sizeX: 2.4, sizeY: 1.6, sizeZ: 1.2 },
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

/** Stair stacks in arena corners — climb toward center; landings are separate thin decks. */
export const COMBAT_SIM_STEP_STACKS: readonly CombatSimStepStackSpec[] = [
  {
    centerOffsetX: -20,
    centerOffsetZ: -18,
    widthX: 2.2,
    depthZ: 6,
    stepCount: 7,
    stepRiseM: 0.28,
    climbDirX: 0,
    climbDirZ: 1,
  },
  {
    centerOffsetX: 18,
    centerOffsetZ: 18,
    widthX: 2,
    depthZ: 5.5,
    stepCount: 6,
    stepRiseM: 0.28,
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
    centerOffsetX: 20,
    centerOffsetZ: -12,
    widthX: 4,
    lengthZ: 10,
    riseM: 1.5,
    climbDirX: -1,
    climbDirZ: 0,
    segmentCount: 12,
  },
  {
    centerOffsetX: -20,
    centerOffsetZ: 14,
    widthX: 3.5,
    lengthZ: 9,
    riseM: 1.25,
    climbDirX: 1,
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

/** Thin landings past stair/ramp tops — 0.2 m clearance, no XZ overlap with climb geometry. */
export const COMBAT_SIM_DECKS: readonly CombatSimDeckSpec[] = [
  // NW: stair stack 0 climbs +Z; landing beyond top edge (Z = -15).
  { centerOffsetX: -20, centerOffsetZ: -12.8, widthX: 4, depthZ: 4, topAboveFootYM: 1.96 },
  // SE: stair stack 1 climbs −Z; landing beyond top edge (Z ≈ 15.25).
  { centerOffsetX: 18, centerOffsetZ: 13.05, widthX: 4, depthZ: 4, topAboveFootYM: 1.68 },
  // NE: ramp 0 climbs −X; landing beyond top edge (X = 15).
  { centerOffsetX: 13.3, centerOffsetZ: -12, widthX: 3, depthZ: 3.5, topAboveFootYM: 1.5 },
  // SW: ramp 1 climbs +X; landing beyond top edge (X = −15).
  { centerOffsetX: -12.55, centerOffsetZ: 14, widthX: 4.5, depthZ: 3, topAboveFootYM: 1.25 },
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
  { centerOffsetX: 0, centerOffsetZ: 0, lengthM: 10, heightM: 1.25, thicknessM: 0.35, yawRad: 0 },
  { centerOffsetX: -14, centerOffsetZ: 8, lengthM: 7, heightM: 1.35, thicknessM: 0.35, yawRad: Math.PI / 2 },
  { centerOffsetX: 10, centerOffsetZ: 14, lengthM: 6, heightM: 1.2, thicknessM: 0.35, yawRad: Math.PI / 4 },
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
  const slabBottom = yTop - COMBAT_SIM_DECK_SLAB_THICK_M;
  collisionOut.push({
    min: [centerX - halfX, slabBottom, centerZ - halfZ],
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

/** Playable floor XZ (before perimeter pad) — fixed combat radius centered on the apartment unit. */
export type CombatSimSessionPlayFootprint = {
  boundMinX: number;
  boundMaxX: number;
  boundMinZ: number;
  boundMaxZ: number;
  footY: number;
};

/**
 * Combat sim uses a dedicated arena size, **not** the apartment interior bounds from SpacetimeDB.
 * Center stays on the owned unit; half-extent is {@link COMBAT_SIM_FALLBACK_HALF_EXTENT_M}.
 */
export function combatSimSessionPlayFootprint(args: {
  boundMinX: number;
  boundMaxX: number;
  boundMinZ: number;
  boundMaxZ: number;
  footY: number;
  halfExtentM?: number;
}): CombatSimSessionPlayFootprint {
  const cx = (args.boundMinX + args.boundMaxX) * 0.5;
  const cz = (args.boundMinZ + args.boundMaxZ) * 0.5;
  const half = args.halfExtentM ?? COMBAT_SIM_FALLBACK_HALF_EXTENT_M;
  return {
    boundMinX: cx - half,
    boundMaxX: cx + half,
    boundMinZ: cz - half,
    boundMaxZ: cz + half,
    footY: args.footY,
  };
}

/** Padded shell used for rendering + collision (walls sit on the outer edge). */
export function combatSimSessionArenaBounds(args: {
  boundMinX: number;
  boundMaxX: number;
  boundMinZ: number;
  boundMaxZ: number;
  footY: number;
  halfExtentM?: number;
}): CombatSimArenaBounds {
  return combatSimArenaBoundsFromUnitFootprint(combatSimSessionPlayFootprint(args));
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
  return [
    ...combatSimArenaStepCollisionAabbs(bounds),
    ...combatSimArenaRampCollisionAabbs(bounds),
    ...combatSimArenaDeckSlabAabbs(bounds),
    ...combatSimArenaLowWallAabbs(bounds),
  ];
}

export function combatSimArenaStepCollisionAabbs(bounds: CombatSimArenaBounds): CollisionAabbLike[] {
  const out: CollisionAabbLike[] = [];
  for (const spec of COMBAT_SIM_STEP_STACKS) {
    appendStepStackGeometry(bounds, spec, out, []);
  }
  return out;
}

export function combatSimArenaRampCollisionAabbs(bounds: CombatSimArenaBounds): CollisionAabbLike[] {
  const out: CollisionAabbLike[] = [];
  for (const spec of COMBAT_SIM_RAMPS) {
    appendRampGeometry(bounds, spec, out, []);
  }
  return out;
}

export function combatSimArenaDeckSlabAabbs(bounds: CombatSimArenaBounds): CollisionAabbLike[] {
  const out: CollisionAabbLike[] = [];
  for (const spec of COMBAT_SIM_DECKS) {
    appendDeckGeometry(bounds, spec, out, []);
  }
  return out;
}

export function combatSimArenaLowWallAabbs(bounds: CombatSimArenaBounds): CollisionAabbLike[] {
  const out: CollisionAabbLike[] = [];
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

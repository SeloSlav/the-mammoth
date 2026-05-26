/** Combat-sim arena shell — keep `apps/server/src/combat_sim.rs` aligned. */

export const COMBAT_SIM_FALLBACK_HALF_EXTENT_M = 14;
export const COMBAT_SIM_ARENA_PAD_M = 6;
export const COMBAT_SIM_WALL_HEIGHT_M = 4;
export const COMBAT_SIM_WALL_THICKNESS_M = 0.35;

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
];

export type CollisionAabbLike = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
};

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
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cz = (bounds.minZ + bounds.maxZ) * 0.5;
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

export function combatSimArenaCollisionAabbs(bounds: CombatSimArenaBounds): CollisionAabbLike[] {
  const floorWalk: CollisionAabbLike = {
    min: [bounds.minX, bounds.footY - 0.12, bounds.minZ],
    max: [bounds.maxX, bounds.footY, bounds.maxZ],
  };
  return [floorWalk, ...combatSimArenaPerimeterWallAabbs(bounds), ...combatSimArenaObstacleAabbs(bounds)];
}

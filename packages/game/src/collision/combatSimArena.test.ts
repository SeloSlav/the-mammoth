import { describe, expect, it } from "vitest";
import {
  COMBAT_SIM_ARENA_PAD_M,
  COMBAT_SIM_AUTHORED_OBSTACLES,
  COMBAT_SIM_DECKS,
  COMBAT_SIM_LOW_WALLS,
  COMBAT_SIM_RAMPS,
  COMBAT_SIM_STEP_STACKS,
  COMBAT_SIM_WALK_SEAM_PAD_Y_HI_M,
  combatSimSessionArenaBounds,
  combatSimSessionPlayFootprint,
  COMBAT_SIM_FALLBACK_HALF_EXTENT_M,
  combatSimArenaCollisionAabbs,
  combatSimArenaDeckSlabAabbs,
  combatSimArenaObstacleAabbs,
  combatSimArenaRampCollisionAabbs,
  combatSimArenaStepCollisionAabbs,
  combatSimSampleWalkTopY,
} from "./combatSimArena.js";

const TERRAIN_SEPARATION_EPS_M = 0.05;

function aabbOverlaps3D(
  a: { min: readonly number[]; max: readonly number[] },
  b: { min: readonly number[]; max: readonly number[] },
  eps = TERRAIN_SEPARATION_EPS_M,
): boolean {
  return (
    a.min[0]! < b.max[0]! - eps &&
    a.max[0]! > b.min[0]! + eps &&
    a.min[1]! < b.max[1]! - eps &&
    a.max[1]! > b.min[1]! + eps &&
    a.min[2]! < b.max[2]! - eps &&
    a.max[2]! > b.min[2]! + eps
  );
}

describe("combatSimArena", () => {
  const bounds = combatSimSessionArenaBounds({
    boundMinX: -4,
    boundMaxX: 4,
    boundMinZ: -4,
    boundMaxZ: 4,
    footY: 60,
  });

  it("expands apartment interior to the fixed combat play footprint", () => {
    const footprint = combatSimSessionPlayFootprint({
      boundMinX: -4,
      boundMaxX: 4,
      boundMinZ: -4,
      boundMaxZ: 4,
      footY: 60,
    });
    expect(footprint.boundMaxX - footprint.boundMinX).toBe(
      COMBAT_SIM_FALLBACK_HALF_EXTENT_M * 2,
    );
    expect(footprint.boundMinX).toBe(-COMBAT_SIM_FALLBACK_HALF_EXTENT_M);
  });

  it("pads unit bounds for the arena shell", () => {
    expect(bounds.minX).toBe(-COMBAT_SIM_FALLBACK_HALF_EXTENT_M - COMBAT_SIM_ARENA_PAD_M);
    expect(bounds.maxX).toBe(COMBAT_SIM_FALLBACK_HALF_EXTENT_M + COMBAT_SIM_ARENA_PAD_M);
  });

  it("includes floor, perimeter walls, obstacles, and terrain", () => {
    const aabbs = combatSimArenaCollisionAabbs(bounds);
    const terrainCount =
      COMBAT_SIM_STEP_STACKS.reduce((n, s) => n + s.stepCount, 0) +
      COMBAT_SIM_RAMPS.reduce((n, r) => n + r.segmentCount, 0) +
      COMBAT_SIM_DECKS.length +
      COMBAT_SIM_LOW_WALLS.length;
    expect(aabbs.length).toBeGreaterThanOrEqual(
      1 + 4 + COMBAT_SIM_AUTHORED_OBSTACLES.length + terrainCount,
    );
  });

  it("places obstacles relative to arena center", () => {
    const obstacles = combatSimArenaObstacleAabbs(bounds);
    expect(obstacles).toHaveLength(COMBAT_SIM_AUTHORED_OBSTACLES.length);
    expect(obstacles[0]!.min[1]).toBe(bounds.footY);
    expect(obstacles[0]!.max[1]).toBeGreaterThan(bounds.footY);
  });

  it("keeps deck platforms separated from stair and ramp collision volumes", () => {
    const stairs = combatSimArenaStepCollisionAabbs(bounds);
    const ramps = combatSimArenaRampCollisionAabbs(bounds);
    const decks = combatSimArenaDeckSlabAabbs(bounds);
    const climb = [...stairs, ...ramps];

    for (let di = 0; di < decks.length; di++) {
      for (let ci = 0; ci < climb.length; ci++) {
        expect(
          aabbOverlaps3D(decks[di]!, climb[ci]!),
          `deck ${di} overlaps climb geometry ${ci}`,
        ).toBe(false);
      }
    }
  });

  it("keeps stairs, ramps, and decks pairwise separated", () => {
    const terrain = [
      ...combatSimArenaStepCollisionAabbs(bounds).map((aabb, i) => [`stair:${i}`, aabb] as const),
      ...combatSimArenaRampCollisionAabbs(bounds).map((aabb, i) => [`ramp:${i}`, aabb] as const),
      ...combatSimArenaDeckSlabAabbs(bounds).map((aabb, i) => [`deck:${i}`, aabb] as const),
    ];

    for (let i = 0; i < terrain.length; i++) {
      for (let j = i + 1; j < terrain.length; j++) {
        const [labelA, aabbA] = terrain[i]!;
        const [labelB, aabbB] = terrain[j]!;
        if (labelA.startsWith("stair:") && labelB.startsWith("stair:")) continue;
        if (labelA.startsWith("ramp:") && labelB.startsWith("ramp:")) continue;
        expect(
          aabbOverlaps3D(aabbA, aabbB),
          `${labelA} overlaps ${labelB}`,
        ).toBe(false);
      }
    }
  });

  it("samples raised walk tops on stair treads and decks", () => {
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cz = (bounds.minZ + bounds.maxZ) * 0.5;
    const stair = COMBAT_SIM_STEP_STACKS[0]!;
    const treadDepth = stair.depthZ / stair.stepCount;
    const firstTreadCenterZ =
      cz + stair.centerOffsetZ - stair.depthZ * 0.5 + treadDepth * 0.5;
    const firstTreadTop = bounds.footY + stair.stepRiseM;
    expect(
      combatSimSampleWalkTopY(bounds, cx + stair.centerOffsetX, firstTreadCenterZ, bounds.footY),
    ).toBeCloseTo(firstTreadTop + COMBAT_SIM_WALK_SEAM_PAD_Y_HI_M, 3);

    const deck = COMBAT_SIM_DECKS[0]!;
    const deckTop = bounds.footY + deck.topAboveFootYM;
    expect(
      combatSimSampleWalkTopY(
        bounds,
        cx + deck.centerOffsetX,
        cz + deck.centerOffsetZ,
        deckTop,
      ),
    ).toBeCloseTo(deckTop + COMBAT_SIM_WALK_SEAM_PAD_Y_HI_M, 3);
  });
});

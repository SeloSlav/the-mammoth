import { describe, expect, it } from "vitest";
import {
  COMBAT_SIM_ARENA_PAD_M,
  COMBAT_SIM_AUTHORED_OBSTACLES,
  COMBAT_SIM_DECKS,
  COMBAT_SIM_RAMPS,
  COMBAT_SIM_STEP_STACKS,
  COMBAT_SIM_WALK_SEAM_PAD_Y_HI_M,
  combatSimArenaBoundsFromUnitFootprint,
  combatSimArenaCollisionAabbs,
  combatSimArenaObstacleAabbs,
  combatSimSampleWalkTopY,
} from "./combatSimArena.js";

describe("combatSimArena", () => {
  const bounds = combatSimArenaBoundsFromUnitFootprint({
    boundMinX: -4,
    boundMaxX: 4,
    boundMinZ: -4,
    boundMaxZ: 4,
    footY: 60,
  });

  it("pads unit bounds for the arena shell", () => {
    expect(bounds.minX).toBe(-4 - COMBAT_SIM_ARENA_PAD_M);
    expect(bounds.maxX).toBe(4 + COMBAT_SIM_ARENA_PAD_M);
  });

  it("includes floor, perimeter walls, obstacles, and terrain", () => {
    const aabbs = combatSimArenaCollisionAabbs(bounds);
    const terrainCount =
      COMBAT_SIM_STEP_STACKS.reduce((n, s) => n + s.stepCount, 0) +
      COMBAT_SIM_RAMPS.reduce((n, r) => n + r.segmentCount, 0) +
      COMBAT_SIM_DECKS.length +
      2;
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

  it("samples raised walk tops on stair treads and decks", () => {
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cz = (bounds.minZ + bounds.maxZ) * 0.5;
    const stair = COMBAT_SIM_STEP_STACKS[0]!;
    const treadDepth = stair.depthZ / stair.stepCount;
    const firstTreadCenterZ =
      cz + stair.centerOffsetZ - stair.depthZ * 0.5 + treadDepth * 0.5;
    const firstTreadTop = bounds.footY + stair.stepRiseM;
    expect(
      combatSimSampleWalkTopY(bounds, cx + stair.centerOffsetX, firstTreadCenterZ, bounds.footY, 0.82, 0.2),
    ).toBeCloseTo(firstTreadTop + COMBAT_SIM_WALK_SEAM_PAD_Y_HI_M, 3);

    const deck = COMBAT_SIM_DECKS[0]!;
    const deckTop = bounds.footY + deck.topAboveFootYM;
    expect(
      combatSimSampleWalkTopY(
        bounds,
        cx + deck.centerOffsetX,
        cz + deck.centerOffsetZ,
        deckTop,
        0.82,
        0.2,
      ),
    ).toBeCloseTo(deckTop + COMBAT_SIM_WALK_SEAM_PAD_Y_HI_M, 3);
  });
});

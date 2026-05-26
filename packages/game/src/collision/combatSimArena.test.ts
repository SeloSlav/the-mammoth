import { describe, expect, it } from "vitest";
import {
  COMBAT_SIM_ARENA_PAD_M,
  COMBAT_SIM_AUTHORED_OBSTACLES,
  combatSimArenaBoundsFromUnitFootprint,
  combatSimArenaCollisionAabbs,
  combatSimArenaObstacleAabbs,
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

  it("includes floor, perimeter walls, and authored obstacles", () => {
    const aabbs = combatSimArenaCollisionAabbs(bounds);
    expect(aabbs.length).toBeGreaterThanOrEqual(1 + 4 + COMBAT_SIM_AUTHORED_OBSTACLES.length);
  });

  it("places obstacles relative to arena center", () => {
    const obstacles = combatSimArenaObstacleAabbs(bounds);
    expect(obstacles).toHaveLength(COMBAT_SIM_AUTHORED_OBSTACLES.length);
    expect(obstacles[0]!.min[1]).toBe(bounds.footY);
    expect(obstacles[0]!.max[1]).toBeGreaterThan(bounds.footY);
  });
});

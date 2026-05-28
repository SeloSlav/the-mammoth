import { describe, expect, it } from "vitest";
import type { ReplicatedNpcSnapshot } from "@the-mammoth/game";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  elevatorSupportFeetWorldY,
  estimateStoreyFromFeetY,
} from "@the-mammoth/world";
import {
  fpNpcOnPlayerStorey,
  fpNpcPassesRenderPvsGate,
} from "./fpNpcRenderPvs.js";

const TYPICAL_SHAFT_PLATE_LOCAL_Y = 1.6589473684210527;
const TYPICAL_SHAFT_SY = 3.1578947368421053;

const snap = (x: number, y: number, z: number): ReplicatedNpcSnapshot => ({
  npcId: 1n,
  archetype: "babushka",
  worldPosition: { x, y, z },
  yawRad: 0,
  velocity: { x: 0, y: 0, z: 0 },
  grounded: true,
  locomotion: "idle",
  state: 0,
  health: 100,
  maxHealth: 100,
  meleePresentationSeq: 0,
  hitPresentationSeq: 0,
  observedTimeMs: 0,
});

describe("fpNpcPassesRenderPvsGate", () => {
  const storeyOpts = {
    buildingWorldOriginY: 0,
    floorSpacingM: 3.2,
    maxLevel: 20,
  };

  it("culls NPCs on a different storey than the player", () => {
    const playerY = 0.25 + 3.2 * (16 - 1);
    const npcOtherStoreyY = 0.25 + 3.2 * (18 - 1);
    expect(fpNpcOnPlayerStorey(npcOtherStoreyY, playerY, storeyOpts)).toBe(false);
    expect(
      fpNpcPassesRenderPvsGate({
        snapshot: snap(0, npcOtherStoreyY, 0),
        playerFeetY: playerY,
        storeyOpts,
      }),
    ).toBe(false);
    expect(fpNpcOnPlayerStorey(playerY, playerY, storeyOpts)).toBe(true);
  });

  it("shows NPCs in corridor and deep inside a unit on the same slab (no XZ PVS)", () => {
    const slabY = 0.25 + 3.2 * (16 - 1);
    const playerFeetY = slabY;
    const corridor = fpNpcPassesRenderPvsGate({
      snapshot: snap(0, slabY, -40),
      playerFeetY,
      storeyOpts,
    });
    const insideEastUnit = fpNpcPassesRenderPvsGate({
      snapshot: snap(8.5, slabY + 0.02, -12),
      playerFeetY,
      storeyOpts,
    });
    const insideWestUnit = fpNpcPassesRenderPvsGate({
      snapshot: snap(-8.5, slabY, 12),
      playerFeetY,
      storeyOpts,
    });
    expect(corridor).toBe(true);
    expect(insideEastUnit).toBe(true);
    expect(insideWestUnit).toBe(true);
  });

  it("megablock deck 16 (levelIndex 17) matches NPC on authored walk feet Y", () => {
    const levelIndex = 17;
    const feetY = elevatorSupportFeetWorldY({
      buildingWorldOriginY: 0,
      levelIndex,
      floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
      shaftPlateLocalY: TYPICAL_SHAFT_PLATE_LOCAL_Y,
      shaftSy: TYPICAL_SHAFT_SY,
    });
    const opts = {
      buildingWorldOriginY: 0,
      floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
      maxLevel: 20,
    };
    expect(estimateStoreyFromFeetY(feetY, opts)).toBe(16);
    expect(fpNpcOnPlayerStorey(feetY, feetY, opts)).toBe(true);
    expect(
      fpNpcPassesRenderPvsGate({
        snapshot: snap(0, feetY, 0),
        playerFeetY: feetY,
        storeyOpts: opts,
      }),
    ).toBe(true);
  });
});

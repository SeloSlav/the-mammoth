import { describe, expect, it } from "vitest";
import type { ReplicatedNpcSnapshot } from "@the-mammoth/game";
import {
  fpNpcOnPlayerStorey,
  fpNpcPassesRenderPvsGate,
} from "./fpNpcRenderPvs.js";

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

  it("shows same-storey NPCs in units without corridor door PVS", () => {
    const slabY = 0.25 + 3.2 * (16 - 1);
    expect(
      fpNpcPassesRenderPvsGate({
        snapshot: snap(4, slabY + 0.02, -8),
        playerFeetY: slabY,
        storeyOpts,
      }),
    ).toBe(true);
  });
});

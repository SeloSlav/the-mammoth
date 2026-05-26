import { describe, expect, it } from "vitest";
import { BABUSHKA_NPC_PERCEPTION } from "./archetypes/babushka.js";
import {
  npcCrouchAggroRangeM,
  npcInVisionCone,
  npcPlayerDetectable,
} from "./npcPerception.js";

describe("npcPerception", () => {
  it("detects a player directly ahead within range", () => {
    expect(
      npcPlayerDetectable({
        profile: BABUSHKA_NPC_PERCEPTION,
        npcYawRad: 0,
        toPlayerX: 0,
        toPlayerZ: 3,
        distSq: 9,
        playerCrouching: false,
      }),
    ).toBe(true);
  });

  it("ignores a player behind the npc", () => {
    expect(
      npcPlayerDetectable({
        profile: BABUSHKA_NPC_PERCEPTION,
        npcYawRad: 0,
        toPlayerX: 0,
        toPlayerZ: -3,
        distSq: 9,
        playerCrouching: false,
      }),
    ).toBe(false);
  });

  it("detects within the vision cone edge", () => {
    const z = 3;
    const x = z * Math.tan(((60 - 1) * Math.PI) / 180);
    expect(
      npcInVisionCone(BABUSHKA_NPC_PERCEPTION, 0, x, z, x * x + z * z),
    ).toBe(true);
  });

  it("rejects outside the vision cone while still in aggro radius", () => {
    const z = 3;
    const x = z * Math.tan(((60 + 8) * Math.PI) / 180);
    expect(
      npcPlayerDetectable({
        profile: BABUSHKA_NPC_PERCEPTION,
        npcYawRad: 0,
        toPlayerX: x,
        toPlayerZ: z,
        distSq: x * x + z * z,
        playerCrouching: false,
      }),
    ).toBe(false);
  });

  it("shrinks detection range while crouched", () => {
    const dist =
      (BABUSHKA_NPC_PERCEPTION.aggroRangeM + npcCrouchAggroRangeM(BABUSHKA_NPC_PERCEPTION)) *
      0.5;
    const distSq = dist * dist;
    expect(
      npcPlayerDetectable({
        profile: BABUSHKA_NPC_PERCEPTION,
        npcYawRad: 0,
        toPlayerX: 0,
        toPlayerZ: dist,
        distSq,
        playerCrouching: false,
      }),
    ).toBe(true);
    expect(
      npcPlayerDetectable({
        profile: BABUSHKA_NPC_PERCEPTION,
        npcYawRad: 0,
        toPlayerX: 0,
        toPlayerZ: dist,
        distSq,
        playerCrouching: true,
      }),
    ).toBe(false);
  });
});

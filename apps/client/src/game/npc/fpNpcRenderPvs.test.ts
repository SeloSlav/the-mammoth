import { describe, expect, it } from "vitest";
import type { ReplicatedNpcSnapshot } from "@the-mammoth/game";
import { fpNpcPassesRenderPvsGate } from "./fpNpcRenderPvs.js";

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
    maxLevel: 19,
  };

  it("culls NPCs outside the active floor plate band", () => {
    expect(
      fpNpcPassesRenderPvsGate({
        snapshot: snap(0, 50, 0),
        floorPlateBand: { lo: 2, hi: 4 },
        storeyOpts,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        corridorPvsVisibleUnitKeys: new Set(),
        unitKeyContainingPoint: () => null,
      }),
    ).toBe(false);
  });

  it("hides NPCs in closed units while walking the corridor", () => {
    expect(
      fpNpcPassesRenderPvsGate({
        snapshot: snap(1, 6.5, 1),
        floorPlateBand: { lo: 2, hi: 2 },
        storeyOpts,
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
        corridorPvsVisibleUnitKeys: new Set(["floor|2|unit_e_003"]),
        unitKeyContainingPoint: () => "floor|2|unit_e_004",
      }),
    ).toBe(false);
  });

  it("shows corridor NPCs and NPCs in PVS-visible units", () => {
    const base = {
      floorPlateBand: { lo: 2, hi: 2 },
      storeyOpts,
      insideResidentialUnit: false,
      insideApartmentInteriorLightingZone: true,
      corridorPvsVisibleUnitKeys: new Set(["floor|2|unit_e_003"]),
      unitKeyContainingPoint: (x: number) =>
        x < 0.5 ? "floor|2|unit_e_003" : null,
    };
    expect(fpNpcPassesRenderPvsGate({ snapshot: snap(0, 6.5, 0), ...base })).toBe(true);
    expect(fpNpcPassesRenderPvsGate({ snapshot: snap(2, 6.5, 0), ...base })).toBe(true);
  });

  it("rejects every NPC when floor plate band is inverted (combat-sim stub regression)", () => {
    expect(
      fpNpcPassesRenderPvsGate({
        snapshot: snap(0, 0, 0),
        floorPlateBand: { lo: 1, hi: 0 },
        storeyOpts: { buildingWorldOriginY: 0, floorSpacingM: 3.2, maxLevel: 0 },
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: false,
        corridorPvsVisibleUnitKeys: new Set(),
        unitKeyContainingPoint: () => null,
      }),
    ).toBe(false);
  });
});

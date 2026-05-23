import { describe, expect, it } from "vitest";
import {
  FISH_TANK_SWIM_AABB,
  fnv1a32,
  mulberry32,
  stepFishTankFish,
  type FishTankSwimFishState,
} from "./apartmentFishTankSwim.js";

function makeFish(px: number, py: number, pz: number): FishTankSwimFishState {
  return {
    px,
    py,
    pz,
    vx: 0,
    vy: 0,
    vz: 0,
    steerT: 0,
    tx: 0,
    ty: 0,
    tz: 0,
  };
}

describe("apartmentFishTankSwim", () => {
  it("mulberry32 is deterministic per seed", () => {
    const a = mulberry32(90210);
    const b = mulberry32(90210);
    expect(a()).toBe(b());
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("steps keep fish inside AABB despite large dt spikes", () => {
    const fish = makeFish(0, 0, 0);
    const rng = mulberry32(0xbeef);
    let maxOut = false;
    for (let frame = 0; frame < 4000; frame++) {
      stepFishTankFish(fish, frame % 41 === 0 ? 0.05 : 0.0167, FISH_TANK_SWIM_AABB, rng);
      if (
        fish.px < FISH_TANK_SWIM_AABB.minX - 1e-9 ||
        fish.px > FISH_TANK_SWIM_AABB.maxX + 1e-9 ||
        fish.py < FISH_TANK_SWIM_AABB.minY - 1e-9 ||
        fish.py > FISH_TANK_SWIM_AABB.maxY + 1e-9 ||
        fish.pz < FISH_TANK_SWIM_AABB.minZ - 1e-9 ||
        fish.pz > FISH_TANK_SWIM_AABB.maxZ + 1e-9
      ) {
        maxOut = true;
        break;
      }
    }
    expect(maxOut).toBe(false);
  });

  it("fnv1a32 distinguishes keys", () => {
    expect(fnv1a32("unit:a:key1")).not.toBe(fnv1a32("unit:b:key2"));
  });
});

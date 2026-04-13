import { describe, expect, it } from "vitest";
import {
  WORLD_SOUND_KIND_CONSUME_DRINK,
  WORLD_SOUND_KIND_CONSUME_EAT,
  WORLD_SOUND_KIND_FOOTSTEP,
  WORLD_SOUND_KIND_ITEM_PICKUP,
  WORLD_SOUND_KIND_MELEE_WEAPON_SWING,
} from "./worldProximityAudio";

/** Numeric `kind` must match `apps/server/src/world_sound.rs` `KIND_*`. */
describe("world sound kinds", () => {
  it("matches server KIND_* constants", () => {
    expect(WORLD_SOUND_KIND_FOOTSTEP).toBe(0);
    expect(WORLD_SOUND_KIND_MELEE_WEAPON_SWING).toBe(1);
    expect(WORLD_SOUND_KIND_ITEM_PICKUP).toBe(2);
    expect(WORLD_SOUND_KIND_CONSUME_EAT).toBe(3);
    expect(WORLD_SOUND_KIND_CONSUME_DRINK).toBe(4);
  });
});

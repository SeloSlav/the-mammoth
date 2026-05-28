import { describe, expect, it } from "vitest";
import {
  FIRST_EXTRACTION_FLOOR_NPC_ENCOUNTER,
  megablockFloorSessionKey,
  parseMegablockFloorSessionKey,
} from "./megablockFloorNpcEncounter.js";
import { FIRST_EXTRACTION_LEVEL_INDEX } from "./playerMissions.js";

describe("megablockFloorNpcEncounter", () => {
  it("round-trips floor session keys", () => {
    const key = megablockFloorSessionKey(FIRST_EXTRACTION_LEVEL_INDEX);
    expect(parseMegablockFloorSessionKey(key)).toBe(
      FIRST_EXTRACTION_LEVEL_INDEX,
    );
  });

  it("first extraction encounter targets deck-16 slab", () => {
    expect(FIRST_EXTRACTION_FLOOR_NPC_ENCOUNTER.levelIndex).toBe(17);
    expect(FIRST_EXTRACTION_FLOOR_NPC_ENCOUNTER.babushkaCount).toBeGreaterThan(
      0,
    );
  });
});

import { describe, expect, it } from "vitest";
import { INITIAL_SPACETIME_TABLE_QUERY_BATCHES } from "./chunkedInitialSpacetimeSubscriptions.js";

describe("INITIAL_SPACETIME_TABLE_QUERY_BATCHES", () => {
  it("keeps parity with legacy single-shot subscribe surface area (exactly 15 SELECT * snapshots)", () => {
    const flat = INITIAL_SPACETIME_TABLE_QUERY_BATCHES.flat();
    expect(flat).toHaveLength(15);

    /** Normalized table name-only keys for regressions against old monolithic subscriber. */
    const keys = flat.map((q) =>
      /^SELECT\s+\*\s+FROM\s+(\w+)/i.exec(q)?.[1]?.toLowerCase(),
    );
    expect(keys.every((k): k is string => typeof k === "string")).toBe(true);
    expect(new Set(keys).size).toBe(15);

    expect(keys).toContain("user");
    expect(keys).toContain("player_pose");
    expect(keys).toContain("world_sound_event");
  });
});

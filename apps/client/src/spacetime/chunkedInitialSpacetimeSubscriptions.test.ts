import { describe, expect, it } from "vitest";
import { Identity } from "spacetimedb";
import type { DbConnection } from "../module_bindings";
import { buildInitialSubscriptionBatches } from "./chunkedInitialSpacetimeSubscriptions.js";

describe("buildInitialSubscriptionBatches", () => {
  it("keeps parity with legacy single-shot subscribe surface (22 DISTINCT tables, solo-scoped)", () => {
    const batches = buildInitialSubscriptionBatches({
      identity: Identity.zero(),
    } as unknown as DbConnection);
    const flat = batches.flat();
    expect(batches[0]?.[0]).toMatch(/^SELECT \* FROM user WHERE identity = 0x/);
    expect(flat.filter((q) => /^SELECT\s+\*\s+FROM\s+user\b/i.test(q))).toHaveLength(1);
    expect(flat).toHaveLength(22);

    /** Normalized table name-only keys for regressions against old monolithic subscriber. */
    const keys = flat.map((q) =>
      /^SELECT\s+\*\s+FROM\s+(\w+)/i.exec(q)?.[1]?.toLowerCase(),
    );
    expect(keys.every((k): k is string => typeof k === "string")).toBe(true);
    expect(new Set(keys).size).toBe(22);

    expect(keys).toContain("user");
    expect(keys).toContain("player_pose");
    expect(keys).toContain("player_world_progress");
    expect(keys).toContain("world_sound_event");
    expect(keys).toContain("player_active_hotbar");
    expect(keys).toContain("balcony_grow_tray");
    expect(keys).toContain("balcony_grow_plant");
    expect(keys).toContain("balcony_water_patch");
  });
});

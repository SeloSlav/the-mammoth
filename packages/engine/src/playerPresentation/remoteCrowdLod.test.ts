import { describe, expect, it } from "vitest";
import { remoteIdsForTopKFullDetail, sortRemoteCrowdRankInPlace } from "./remoteCrowdLod.js";

describe("remoteCrowdLod", () => {
  it("sorts by distance then id for stability", () => {
    const rank = [
      { id: "z", distSq: 9 },
      { id: "m", distSq: 1 },
      { id: "a", distSq: 4 },
      { id: "b", distSq: 4 },
    ];
    sortRemoteCrowdRankInPlace(rank);
    expect(rank.map((r) => r.id)).toEqual(["m", "a", "b", "z"]);
  });

  it("take top K", () => {
    const rank = [
      { id: "near", distSq: 0.1 },
      { id: "mid", distSq: 2 },
      { id: "far", distSq: 80 },
    ];
    sortRemoteCrowdRankInPlace(rank);
    expect(remoteIdsForTopKFullDetail(rank, 2)).toEqual(new Set(["near", "mid"]));
    expect(remoteIdsForTopKFullDetail(rank, 0)).toEqual(new Set());
  });
});

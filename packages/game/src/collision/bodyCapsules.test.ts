import { describe, expect, it } from "vitest";
import {
  BABUSHKA_BODY_RADIUS_M,
  babushkaMinPeerCenterDistanceM,
  babushkaMinPlayerCenterDistanceM,
  capsuleMinCenterDistanceM,
  npcCapsuleCollisionAabb,
  PLAYER_BODY_RADIUS_M,
  verticalCapsuleOverlap,
} from "./bodyCapsules.js";

describe("bodyCapsules", () => {
  it("matches server babushka peer min center distance", () => {
    expect(babushkaMinPeerCenterDistanceM()).toBeCloseTo(BABUSHKA_BODY_RADIUS_M * 2 + 0.1, 6);
  });

  it("matches server babushka player min center distance", () => {
    expect(babushkaMinPlayerCenterDistanceM()).toBeCloseTo(
      BABUSHKA_BODY_RADIUS_M + PLAYER_BODY_RADIUS_M + 0.1,
      6,
    );
  });

  it("detects vertical capsule overlap on the same floor", () => {
    expect(verticalCapsuleOverlap(60, 1.78, 60, 1.55)).toBe(true);
    expect(verticalCapsuleOverlap(60, 1.78, 63.2, 1.55)).toBe(false);
  });

  it("builds npc capsule AABB from feet and dims", () => {
    const aabb = npcCapsuleCollisionAabb({
      feetX: 1,
      feetY: 2,
      feetZ: 3,
      radiusM: 0.28,
      heightM: 1.55,
    });
    expect(aabb.min[0]).toBeCloseTo(0.72, 6);
    expect(aabb.min[1]).toBeCloseTo(2, 6);
    expect(aabb.min[2]).toBeCloseTo(2.72, 6);
    expect(aabb.max[0]).toBeCloseTo(1.28, 6);
    expect(aabb.max[1]).toBeCloseTo(3.55, 6);
    expect(aabb.max[2]).toBeCloseTo(3.28, 6);
  });

  it("capsuleMinCenterDistanceM sums radii and gap", () => {
    expect(capsuleMinCenterDistanceM(0.22, 0.28)).toBeCloseTo(0.6, 6);
  });
});

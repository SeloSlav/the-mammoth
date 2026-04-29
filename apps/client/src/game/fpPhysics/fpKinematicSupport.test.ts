import { describe, expect, it } from "vitest";
import { createFpLocomotionState } from "@the-mammoth/engine";
import {
  clampAttachedBodyXZToKinematicSupportIfNeeded,
  getKinematicSupportVerticalVelocityMps,
  mergeKinematicSupportTop,
  snapAttachedFeetToKinematicSupportIfNeeded,
  type FpKinematicSupportProvider,
} from "./fpKinematicSupport.js";

function provider(
  overrides: Partial<FpKinematicSupportProvider>,
): FpKinematicSupportProvider {
  return {
    sampleSupportSurface: () => null,
    resolveAttachment: () => null,
    ...overrides,
  };
}

describe("fpKinematicSupport", () => {
  it("merges a moving support top over static ground", () => {
    const moving = provider({
      sampleSupportSurface: () => ({
        topY: 4.25,
        verticalVelocityMps: 1.5,
      }),
    });
    const opts = {
      worldX: 0,
      worldZ: 0,
      probeTopY: 5,
      footRadiusXZ: 0.22,
      stepUpMargin: 0.82,
      baseTop: 3.5,
      evalWallClockMs: 1234,
    };
    expect(mergeKinematicSupportTop(moving, opts)).toBe(4.25);
    expect(getKinematicSupportVerticalVelocityMps(moving, opts)).toBe(1.5);
  });

  it("snaps attached feet to the support and grounds the player", () => {
    const moving = provider({
      resolveAttachment: () => ({
        supportFeetY: 7.4,
      }),
    });
    const pos = { x: 1, y: 6.9, z: 2 };
    const loco = createFpLocomotionState();
    loco.grounded = false;
    loco.velocity.y = -2.5;

    expect(
      snapAttachedFeetToKinematicSupportIfNeeded(moving, pos, loco, {
        evalWallClockMs: 2000,
        jumpPressedThisFrame: false,
        skipAttachUpwardVyMps: 0.85,
      }),
    ).toBe(true);
    expect(pos.y).toBe(7.4);
    expect(loco.velocity.y).toBe(0);
    expect(loco.grounded).toBe(true);
  });

  it("does not reattach while the player is actively jumping upward", () => {
    const moving = provider({
      resolveAttachment: () => ({
        supportFeetY: 7.4,
      }),
    });
    const pos = { x: 1, y: 6.9, z: 2 };
    const loco = createFpLocomotionState();
    loco.velocity.y = 1.2;

    expect(
      snapAttachedFeetToKinematicSupportIfNeeded(moving, pos, loco, {
        evalWallClockMs: 2000,
        jumpPressedThisFrame: true,
        skipAttachUpwardVyMps: 0.85,
      }),
    ).toBe(false);
    expect(pos.y).toBe(6.9);
  });

  it("clamps attached XZ motion and zeroes blocked velocity axes", () => {
    const moving = provider({
      resolveAttachment: () => ({
        supportFeetY: 7.4,
        clampWorldXZ: () => ({
          x: 2.5,
          z: -1.25,
          didClamp: true,
        }),
      }),
    });
    const pos = { x: 3.25, y: 7.4, z: -1.9 };
    const loco = createFpLocomotionState();
    loco.velocity.x = 1.1;
    loco.velocity.z = -0.8;

    expect(clampAttachedBodyXZToKinematicSupportIfNeeded(moving, pos, loco, 2000)).toBe(true);
    expect(pos).toMatchObject({ x: 2.5, z: -1.25 });
    expect(loco.velocity.x).toBe(0);
    expect(loco.velocity.z).toBe(0);
  });
});

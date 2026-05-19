import { describe, expect, it } from "vitest";
import {
  fpHudPickRaycastDue,
  fpHudPickThrottleStateFromSample,
} from "./fpSessionHudPickThrottle.js";

describe("fpHudPickRaycastDue", () => {
  const baseState = fpHudPickThrottleStateFromSample({
    feetX: 1,
    feetY: 2,
    feetZ: 3,
    cameraYawRad: 0.5,
    cameraPitchRad: -0.1,
  });

  it("always runs while the interact key is held", () => {
    expect(
      fpHudPickRaycastDue({
        state: baseState,
        frameIndex: 1,
        feetX: 1,
        feetY: 2,
        feetZ: 3,
        cameraYawRad: 0.5,
        cameraPitchRad: -0.1,
        interactKeyDown: true,
        activePrompt: false,
      }),
    ).toBe(true);
  });

  it("always runs while a prompt is active", () => {
    expect(
      fpHudPickRaycastDue({
        state: baseState,
        frameIndex: 1,
        feetX: 1,
        feetY: 2,
        feetZ: 3,
        cameraYawRad: 0.5,
        cameraPitchRad: -0.1,
        interactKeyDown: false,
        activePrompt: true,
      }),
    ).toBe(true);
  });

  it("runs immediately when coarse feet or look buckets change", () => {
    expect(
      fpHudPickRaycastDue({
        state: baseState,
        frameIndex: 2,
        feetX: 1,
        feetY: 2,
        feetZ: 3,
        cameraYawRad: 1.2,
        cameraPitchRad: -0.1,
        interactKeyDown: false,
        activePrompt: false,
      }),
    ).toBe(true);
  });

  it("throttles idle spinning to every N frames", () => {
    expect(
      fpHudPickRaycastDue({
        state: baseState,
        frameIndex: 1,
        feetX: 1,
        feetY: 2,
        feetZ: 3,
        cameraYawRad: 0.5,
        cameraPitchRad: -0.1,
        interactKeyDown: false,
        activePrompt: false,
        idleIntervalFrames: 4,
      }),
    ).toBe(false);
    expect(
      fpHudPickRaycastDue({
        state: baseState,
        frameIndex: 4,
        feetX: 1,
        feetY: 2,
        feetZ: 3,
        cameraYawRad: 0.5,
        cameraPitchRad: -0.1,
        interactKeyDown: false,
        activePrompt: false,
        idleIntervalFrames: 4,
      }),
    ).toBe(true);
  });
});

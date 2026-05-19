import { describe, expect, it } from "vitest";
import {
  enterFpSit,
  exitFpSit,
  fpSitBlocksLocomotion,
  fpSitConsumeWasdExit,
  getFpSitSession,
  isFpSitActive,
} from "./fpSitSession.js";

describe("fpSitSession", () => {
  it("enter and exit", () => {
    expect(isFpSitActive()).toBe(false);
    enterFpSit({
      active: true,
      sittableKey: "test",
      unitKey: "u1",
      mode: "sit",
      anchor: { x: 1, y: 2, z: 3 },
      bodyYawRad: 0.5,
      eyeHeightM: 1.05,
    });
    expect(isFpSitActive()).toBe(true);
    expect(fpSitBlocksLocomotion()).toBe(true);
    expect(getFpSitSession()?.sittableKey).toBe("test");
    exitFpSit();
    expect(isFpSitActive()).toBe(false);
  });

  it("fpSitConsumeWasdExit clears on movement keys", () => {
    enterFpSit({
      active: true,
      sittableKey: "test",
      unitKey: "u1",
      mode: "sit",
      anchor: { x: 0, y: 0, z: 0 },
      bodyYawRad: 0,
      eyeHeightM: 1,
    });
    const keys = new Set<string>();
    expect(fpSitConsumeWasdExit(keys)).toBe(false);
    keys.add("KeyW");
    expect(fpSitConsumeWasdExit(keys)).toBe(true);
    expect(isFpSitActive()).toBe(false);
  });
});
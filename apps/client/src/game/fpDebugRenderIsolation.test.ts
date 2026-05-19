import { describe, expect, it } from "vitest";
import {
  getFpDebugRenderIsolationFlags,
  resetFpDebugRenderIsolationFlags,
  setAllFpDebugRenderIsolationFlags,
  setFpDebugRenderIsolationFlag,
} from "./fpDebugRenderIsolation.js";

describe("fpDebugRenderIsolation", () => {
  it("defaults all subsystems to enabled", () => {
    resetFpDebugRenderIsolationFlags();
    const flags = getFpDebugRenderIsolationFlags();
    expect(flags.apartmentDecor).toBe(true);
    expect(flags.environmentLighting).toBe(true);
    expect(flags.mirrors).toBe(true);
  });

  it("toggles individual flags", () => {
    resetFpDebugRenderIsolationFlags();
    setFpDebugRenderIsolationFlag("apartmentDecor", false);
    expect(getFpDebugRenderIsolationFlags().apartmentDecor).toBe(false);
    expect(getFpDebugRenderIsolationFlags().apartmentFurniture).toBe(true);
  });

  it("setAllFpDebugRenderIsolationFlags flips every flag", () => {
    resetFpDebugRenderIsolationFlags();
    setAllFpDebugRenderIsolationFlags(false);
    const flags = getFpDebugRenderIsolationFlags();
    expect(Object.values(flags).every((v) => v === false)).toBe(true);
  });
});

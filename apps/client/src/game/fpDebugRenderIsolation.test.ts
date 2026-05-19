import { describe, expect, it } from "vitest";
import {
  getFpDebugRenderIsolationFlags,
  isFpDebugRenderIsolationEnabled,
  isFpDebugRenderIsolationSuppressingAnything,
  resetFpDebugRenderIsolationFlags,
  setAllFpDebugRenderIsolationFlags,
  setFpDebugRenderIsolationFlag,
} from "./fpDebugRenderIsolation.js";

describe("fpDebugRenderIsolation", () => {
  it("defaults all subsystems to enabled", () => {
    resetFpDebugRenderIsolationFlags();
    expect(isFpDebugRenderIsolationSuppressingAnything()).toBe(false);
    expect(isFpDebugRenderIsolationEnabled("exteriorTrees")).toBe(true);
  });

  it("toggles individual flags", () => {
    resetFpDebugRenderIsolationFlags();
    setFpDebugRenderIsolationFlag("apartmentDecor", false);
    expect(isFpDebugRenderIsolationEnabled("apartmentDecor")).toBe(false);
    expect(isFpDebugRenderIsolationSuppressingAnything()).toBe(true);
    expect(getFpDebugRenderIsolationFlags().apartmentFurniture).toBe(true);
  });

  it("setAllFpDebugRenderIsolationFlags flips every flag", () => {
    resetFpDebugRenderIsolationFlags();
    setAllFpDebugRenderIsolationFlags(false);
    const flags = getFpDebugRenderIsolationFlags();
    expect(Object.values(flags).every((v) => v === false)).toBe(true);
    expect(isFpDebugRenderIsolationSuppressingAnything()).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { resolveAuthoritativeInteractionPose } from "./fpInteractionAuthority";

describe("resolveAuthoritativeInteractionPose", () => {
  it("keeps local pose when drift is small", () => {
    const local = { x: 10.4, y: 6.5, z: -2.2 };
    const server = { x: 10.0, y: 6.55, z: -2.0 };
    expect(resolveAuthoritativeInteractionPose(local, server)).toBe(local);
  });

  it("keeps local pose on large XZ drift so prompts match prediction", () => {
    const local = { x: 10.0, y: 6.5, z: -2.0 };
    const server = { x: 8.8, y: 6.52, z: -2.1 };
    expect(resolveAuthoritativeInteractionPose(local, server)).toBe(local);
  });

  it("keeps local pose on large vertical drift so prompts match prediction", () => {
    const local = { x: 10.0, y: 10.0, z: -2.0 };
    const server = { x: 10.1, y: 8.9, z: -2.1 };
    expect(resolveAuthoritativeInteractionPose(local, server)).toBe(local);
  });

  it("uses local when server still lags behind after leaving an interact volume", () => {
    const local = { x: 24.0, y: 1.0, z: -3.0 };
    const server = { x: 12.5, y: 1.0, z: -3.0 };
    expect(resolveAuthoritativeInteractionPose(local, server)).toBe(local);
  });
});

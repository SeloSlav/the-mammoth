import { describe, expect, it } from "vitest";
import { resolveAuthoritativeInteractionPose } from "./fpInteractionAuthority";

describe("resolveAuthoritativeInteractionPose", () => {
  it("keeps local pose when drift is small", () => {
    const local = { x: 10.4, y: 6.5, z: -2.2 };
    const server = { x: 10.0, y: 6.55, z: -2.0 };
    expect(resolveAuthoritativeInteractionPose(local, server)).toBe(local);
  });

  it("switches to server pose on large XZ drift", () => {
    const local = { x: 10.0, y: 6.5, z: -2.0 };
    const server = { x: 8.8, y: 6.52, z: -2.1 };
    expect(resolveAuthoritativeInteractionPose(local, server)).toBe(server);
  });

  it("switches to server pose on large vertical drift", () => {
    const local = { x: 10.0, y: 10.0, z: -2.0 };
    const server = { x: 10.1, y: 8.9, z: -2.1 };
    expect(resolveAuthoritativeInteractionPose(local, server)).toBe(server);
  });
});

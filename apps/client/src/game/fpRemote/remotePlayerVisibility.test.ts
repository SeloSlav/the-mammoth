import { describe, expect, it } from "vitest";
import { shouldRenderRemotePlayer } from "./remotePlayerVisibility.js";

const buildingBoundsXz = {
  minX: -12,
  maxX: 12,
  minZ: -12,
  maxZ: 12,
} as const;

describe("shouldRenderRemotePlayer", () => {
  it("hides interior players when the local player is well outside the building", () => {
    expect(
      shouldRenderRemotePlayer({
        localCameraX: -30,
        localCameraZ: 0,
        localFeetX: -30,
        localFeetY: 0,
        localFeetZ: 0,
        remoteFeetX: 0,
        remoteFeetY: 0,
        remoteFeetZ: 0,
        buildingBoundsXz,
      }),
    ).toBe(false);
  });

  it("keeps nearby interior players visible when standing just outside the footprint", () => {
    expect(
      shouldRenderRemotePlayer({
        localCameraX: 14,
        localCameraZ: 0,
        localFeetX: 14,
        localFeetY: 0,
        localFeetZ: 0,
        remoteFeetX: 0,
        remoteFeetY: 0,
        remoteFeetZ: 0,
        buildingBoundsXz,
      }),
    ).toBe(true);
  });

  it("keeps nearby floors visible when both players are inside", () => {
    expect(
      shouldRenderRemotePlayer({
        localCameraX: 0,
        localCameraZ: 0,
        localFeetX: 0,
        localFeetY: 0,
        localFeetZ: 0,
        remoteFeetX: 4,
        remoteFeetY: 3,
        remoteFeetZ: 0,
        buildingBoundsXz,
      }),
    ).toBe(true);
  });

  it("hides players several floors away when both are inside", () => {
    expect(
      shouldRenderRemotePlayer({
        localCameraX: 0,
        localCameraZ: 0,
        localFeetX: 0,
        localFeetY: 0,
        localFeetZ: 0,
        remoteFeetX: 4,
        remoteFeetY: 8,
        remoteFeetZ: 0,
        buildingBoundsXz,
      }),
    ).toBe(false);
  });

  it("does not hide nearby exterior players just because the local player is inside", () => {
    expect(
      shouldRenderRemotePlayer({
        localCameraX: 0,
        localCameraZ: 0,
        localFeetX: 0,
        localFeetY: 0,
        localFeetZ: 0,
        remoteFeetX: 18,
        remoteFeetY: 0,
        remoteFeetZ: 0,
        buildingBoundsXz,
      }),
    ).toBe(true);
  });
});

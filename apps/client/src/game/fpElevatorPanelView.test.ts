import { describe, expect, it } from "vitest";
import { fpElevCarPanelDoorwayViewLocal } from "./fpElevatorWorld";

describe("fpElevCarPanelDoorwayViewLocal", () => {
  const inner = { halfX: 2, halfZ: 2, innerH: 2.5 };
  const cabFeetY = 10;
  const pyOk = cabFeetY + 0.5;

  it("accepts a point just outside an east-facing door on the landing", () => {
    const lx = inner.halfX + 0.55;
    const lz = 0;
    expect(fpElevCarPanelDoorwayViewLocal("e", lx, lz, pyOk, cabFeetY, inner)).toBe(true);
  });

  it("accepts a point deeper in the hallway along the door normal (east)", () => {
    const lx = inner.halfX + 2.4;
    const lz = 0;
    expect(fpElevCarPanelDoorwayViewLocal("e", lx, lz, pyOk, cabFeetY, inner)).toBe(true);
  });

  it("accepts a point well down the corridor so the in-car panel can stay mounted for raycast", () => {
    const lx = inner.halfX + 4.9;
    const lz = 0;
    expect(fpElevCarPanelDoorwayViewLocal("e", lx, lz, pyOk, cabFeetY, inner)).toBe(true);
  });

  it("rejects far down the corridor past the doorway lip", () => {
    const lx = inner.halfX + 5.35;
    const lz = 0;
    expect(fpElevCarPanelDoorwayViewLocal("e", lx, lz, pyOk, cabFeetY, inner)).toBe(false);
  });

  it("accepts a point slightly inside the threshold on the east door side", () => {
    const lx = inner.halfX - 0.2;
    const lz = 0;
    expect(fpElevCarPanelDoorwayViewLocal("e", lx, lz, pyOk, cabFeetY, inner)).toBe(true);
  });

  it("rejects far sideways from the door span (east)", () => {
    const lx = inner.halfX + 0.4;
    const lz = 1.35;
    expect(fpElevCarPanelDoorwayViewLocal("e", lx, lz, pyOk, cabFeetY, inner)).toBe(false);
  });

  it("mirrors for west-facing door", () => {
    const lx = -inner.halfX - 0.55;
    const lz = 0;
    expect(fpElevCarPanelDoorwayViewLocal("w", lx, lz, pyOk, cabFeetY, inner)).toBe(true);
  });

  it("handles north / south faces", () => {
    expect(fpElevCarPanelDoorwayViewLocal("n", 0, inner.halfZ + 0.4, pyOk, cabFeetY, inner)).toBe(
      true,
    );
    expect(fpElevCarPanelDoorwayViewLocal("s", 0, -inner.halfZ - 0.4, pyOk, cabFeetY, inner)).toBe(
      true,
    );
  });

  it("rejects wrong vertical band", () => {
    expect(fpElevCarPanelDoorwayViewLocal("e", inner.halfX + 0.4, 0, cabFeetY - 2, cabFeetY, inner)).toBe(
      false,
    );
  });
});

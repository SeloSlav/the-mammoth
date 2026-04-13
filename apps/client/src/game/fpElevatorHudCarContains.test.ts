import { describe, expect, it } from "vitest";
import { fpElevatorHudCarContainsLocalPoint } from "./fpElevatorWorld";

describe("fpElevatorHudCarContainsLocalPoint", () => {
  const inner = { halfX: 2, halfZ: 2, innerH: 2.5 };
  const carFeetY = 10;

  it("accepts plate-local points that are outside tight gameplay 0.88 fraction but inside HUD slack", () => {
    const lx = inner.halfX * 0.9;
    const lz = 0;
    const py = carFeetY + 0.5;
    expect(Math.abs(lx)).toBeGreaterThan(inner.halfX * 0.88);
    expect(fpElevatorHudCarContainsLocalPoint(lx, lz, py, carFeetY, inner)).toBe(true);
  });

  it("still rejects points well outside the hoistway", () => {
    expect(
      fpElevatorHudCarContainsLocalPoint(inner.halfX * 1.2, 0, carFeetY + 0.5, carFeetY, inner),
    ).toBe(false);
  });
});

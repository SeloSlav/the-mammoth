import { describe, expect, it } from "vitest";
import { CAB_INTERP_SEC, EXTERIOR_DOOR_VIS_INTERP_SEC } from "./fpElevatorConstants.js";
import { FpElevatorCabInterpScalar } from "./fpElevatorShaftVisual.js";

describe("FpElevatorCabInterpScalar", () => {
  it("defaults to CAB_INTERP_SEC and reaches the target by end-of-window", () => {
    const s = new FpElevatorCabInterpScalar();
    const t0 = 1_000;
    s.setTarget(1, t0);
    expect(s.eval(t0)).toBe(1);
    expect(s.eval(t0 + CAB_INTERP_SEC * 1000)).toBe(1);
  });

  it("honors a custom window duration", () => {
    const s = new FpElevatorCabInterpScalar(EXTERIOR_DOOR_VIS_INTERP_SEC);
    const t0 = 5_000;
    s.setTarget(0, t0);
    expect(s.eval(t0)).toBe(0);
    const t1 = t0 + 1;
    s.setTarget(1, t1);
    const durMs = EXTERIOR_DOOR_VIS_INTERP_SEC * 1000;
    const mid = t1 + durMs * 0.5;
    expect(s.eval(mid)).toBeGreaterThan(0);
    expect(s.eval(mid)).toBeLessThan(1);
    expect(s.eval(t1 + durMs)).toBe(1);
  });
});

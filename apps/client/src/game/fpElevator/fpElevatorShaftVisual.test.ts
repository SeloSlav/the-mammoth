import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CAB_INTERP_SEC, EXTERIOR_DOOR_VIS_INTERP_SEC } from "./fpElevatorConstants.js";
import {
  FpElevatorCabInterpScalar,
  syncElevatorLandingLevelObjectVisibility,
} from "./fpElevatorShaftVisual.js";

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

describe("syncElevatorLandingLevelObjectVisibility", () => {
  it("keeps only landing helper volumes near the active floor band", () => {
    const levels = new Map<number, THREE.Object3D>([
      [1, new THREE.Group()],
      [18, new THREE.Group()],
      [19, new THREE.Group()],
      [20, new THREE.Group()],
    ]);

    syncElevatorLandingLevelObjectVisibility(levels, { lo: 20, hi: 20 }, true);

    expect(levels.get(1)?.visible).toBe(false);
    expect(levels.get(18)?.visible).toBe(false);
    expect(levels.get(19)?.visible).toBe(true);
    expect(levels.get(20)?.visible).toBe(true);

    syncElevatorLandingLevelObjectVisibility(levels, { lo: 20, hi: 20 }, false);
    expect([...levels.values()].every((object) => object.visible === false)).toBe(true);
  });
});

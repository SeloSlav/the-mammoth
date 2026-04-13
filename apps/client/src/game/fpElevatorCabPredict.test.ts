import { describe, expect, it } from "vitest";
import {
  elevatorMoveSmoothstep01,
  predictMovingCabFeetWorldY,
  predictMovingCabFeetWorldYVelocityMps,
} from "./fpElevatorCabPredict";

describe("elevatorMoveSmoothstep01", () => {
  it("is 0 at 0 and 1 at 1", () => {
    expect(elevatorMoveSmoothstep01(0)).toBe(0);
    expect(elevatorMoveSmoothstep01(1)).toBe(1);
  });

  it("clamps outside 0..1", () => {
    expect(elevatorMoveSmoothstep01(-2)).toBe(0);
    expect(elevatorMoveSmoothstep01(3)).toBe(1);
  });
});

describe("predictMovingCabFeetWorldY", () => {
  const feet = (lv: number) => lv * 10;

  it("matches replica when no time has passed", () => {
    const y = predictMovingCabFeetWorldY({
      moveFromLevel: 1,
      moveToLevel: 2,
      moveUAtReplica: 0.4,
      elapsedSecSinceReplica: 0,
      feetYForLevel: feet,
      moveSpeedMps: 1,
    });
    const y0 = 10;
    const y1 = 20;
    const dist = y1 - y0;
    const u = 0.4;
    const s = u * u * (3 - 2 * u);
    expect(y).toBeCloseTo(y0 + dist * s, 5);
  });

  it("is monotone decreasing when descending (y1 < y0)", () => {
    let prev = 1e9;
    for (let i = 0; i < 40; i++) {
      const t = i * 0.008;
      const y = predictMovingCabFeetWorldY({
        moveFromLevel: 5,
        moveToLevel: 1,
        moveUAtReplica: 0,
        elapsedSecSinceReplica: t,
        feetYForLevel: feet,
        moveSpeedMps: 2,
      });
      expect(y).toBeLessThanOrEqual(prev + 1e-5);
      prev = y;
    }
  });

  it("caps at destination when elapsed is huge", () => {
    const y = predictMovingCabFeetWorldY({
      moveFromLevel: 1,
      moveToLevel: 3,
      moveUAtReplica: 0.9,
      elapsedSecSinceReplica: 100,
      feetYForLevel: feet,
      moveSpeedMps: 1,
    });
    expect(y).toBe(30);
  });
});

describe("predictMovingCabFeetWorldYVelocityMps", () => {
  const feet = (lv: number) => lv * 10;

  it("matches numerical derivative of predictMovingCabFeetWorldY", () => {
    const optsBase = {
      moveFromLevel: 1,
      moveToLevel: 4,
      moveUAtReplica: 0.22,
      feetYForLevel: feet,
      moveSpeedMps: 1.2,
    };
    const eps = 1e-4;
    const t0 = 0.08;
    const yA = predictMovingCabFeetWorldY({ ...optsBase, elapsedSecSinceReplica: t0 });
    const yB = predictMovingCabFeetWorldY({ ...optsBase, elapsedSecSinceReplica: t0 + eps });
    const num = (yB - yA) / eps;
    const ana = predictMovingCabFeetWorldYVelocityMps({ ...optsBase, elapsedSecSinceReplica: t0 });
    expect(ana).toBeCloseTo(num, 3);
  });

  it("is zero before start and after arrival", () => {
    expect(
      predictMovingCabFeetWorldYVelocityMps({
        moveFromLevel: 1,
        moveToLevel: 2,
        moveUAtReplica: 0,
        elapsedSecSinceReplica: -0.05,
        feetYForLevel: feet,
      }),
    ).toBe(0);
    expect(
      predictMovingCabFeetWorldYVelocityMps({
        moveFromLevel: 1,
        moveToLevel: 2,
        moveUAtReplica: 0.99,
        elapsedSecSinceReplica: 10,
        feetYForLevel: feet,
      }),
    ).toBe(0);
  });
});

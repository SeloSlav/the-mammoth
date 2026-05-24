import { describe, expect, it } from "vitest";
import {
  deriveFpFirearmAimRigRootFromHip,
  smoothStep01,
} from "./fpFirearmAimRigPose.js";

describe("deriveFpFirearmAimRigRootFromHip", () => {
  it("nudges toward center while keeping most of the hip roll", () => {
    const aim = deriveFpFirearmAimRigRootFromHip(
      { x: 0.2437, y: -0.203, z: -0.4104 },
      { x: 0, y: 0, z: -1.8344 },
    );
    expect(Math.abs(aim.positionM.x)).toBeLessThan(0.2437);
    expect(aim.positionM.z).toBeLessThan(-0.4104);
    expect(Math.abs(aim.eulerRad.z)).toBeGreaterThan(1.5);
    expect(Math.abs(aim.eulerRad.z)).toBeLessThan(1.8344);
  });
});

describe("smoothStep01", () => {
  it("eases endpoints", () => {
    expect(smoothStep01(0)).toBe(0);
    expect(smoothStep01(1)).toBe(1);
    expect(smoothStep01(0.5)).toBeGreaterThan(0.4);
    expect(smoothStep01(0.5)).toBeLessThan(0.6);
  });
});

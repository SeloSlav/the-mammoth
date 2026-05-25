import { describe, expect, it, beforeEach } from "vitest";
import {
  getMammothCompassHeadingRad,
  publishMammothCompassHeadingFromForwardXZ,
  resetMammothCompassHeading,
} from "./compassHeading.js";

describe("compassHeading", () => {
  beforeEach(() => {
    resetMammothCompassHeading();
  });

  it("maps +Z forward to 0 rad (north)", () => {
    publishMammothCompassHeadingFromForwardXZ(0, 1);
    expect(getMammothCompassHeadingRad()).toBe(0);
  });

  it("maps +X forward to π/2 rad (east)", () => {
    publishMammothCompassHeadingFromForwardXZ(1, 0);
    expect(getMammothCompassHeadingRad()).toBeCloseTo(Math.PI / 2, 6);
  });

  it("ignores zero-length forward", () => {
    publishMammothCompassHeadingFromForwardXZ(0, 1);
    publishMammothCompassHeadingFromForwardXZ(0, 0);
    expect(getMammothCompassHeadingRad()).toBe(0);
  });

  it("normalizes diagonal forward", () => {
    publishMammothCompassHeadingFromForwardXZ(3, 3);
    expect(getMammothCompassHeadingRad()).toBeCloseTo(Math.PI / 4, 6);
  });
});

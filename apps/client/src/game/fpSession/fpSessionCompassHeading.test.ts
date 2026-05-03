import { beforeEach, describe, expect, it } from "vitest";
import {
  getFpSessionCompassHeadingRad,
  publishFpSessionCompassHeadingFromForwardXZ,
  resetFpSessionCompassHeading,
} from "./fpSessionCompassHeading.js";

describe("fpSessionCompassHeading", () => {
  beforeEach(() => {
    resetFpSessionCompassHeading();
  });

  it("maps +Z forward to zero heading (north)", () => {
    publishFpSessionCompassHeadingFromForwardXZ(0, 1);
    expect(getFpSessionCompassHeadingRad()).toBe(0);
  });

  it("maps +X forward to east (π/2)", () => {
    publishFpSessionCompassHeadingFromForwardXZ(1, 0);
    expect(getFpSessionCompassHeadingRad()).toBeCloseTo(Math.PI / 2, 6);
  });

  it("leaves heading unchanged when the xz component vanishes", () => {
    publishFpSessionCompassHeadingFromForwardXZ(0, 1);
    publishFpSessionCompassHeadingFromForwardXZ(0, 0);
    expect(getFpSessionCompassHeadingRad()).toBe(0);
  });

  it("normalizes non-unit xz vectors", () => {
    publishFpSessionCompassHeadingFromForwardXZ(3, 3);
    expect(getFpSessionCompassHeadingRad()).toBeCloseTo(Math.PI / 4, 6);
  });
});

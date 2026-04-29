import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { doorSlideAxis, floorButtonLabel } from "./fpElevatorLabels";

describe("floorButtonLabel", () => {
  it("uses authored compact labels when provided", () => {
    const labels = new Map<number, string>([
      [1, "PR"],
      [2, "1"],
      [12, "11"],
    ]);
    expect(floorButtonLabel(1, labels)).toBe("PR");
    expect(floorButtonLabel(2, labels)).toBe("1");
    expect(floorButtonLabel(12, labels)).toBe("11");
  });

  it("falls back to raw level indices without authored labels", () => {
    expect(floorButtonLabel(1)).toBe("1");
    expect(floorButtonLabel(12)).toBe("12");
  });
});

describe("doorSlideAxis", () => {
  it("slides east-west doors along world Z", () => {
    expect(doorSlideAxis("e").equals(new THREE.Vector3(0, 0, 1))).toBe(true);
    expect(doorSlideAxis("w").equals(new THREE.Vector3(0, 0, 1))).toBe(true);
  });

  it("slides north-south doors along world X", () => {
    expect(doorSlideAxis("n").equals(new THREE.Vector3(1, 0, 0))).toBe(true);
    expect(doorSlideAxis("s").equals(new THREE.Vector3(1, 0, 0))).toBe(true);
  });
});

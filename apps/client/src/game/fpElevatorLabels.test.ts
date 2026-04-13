import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { doorSlideAxis, floorButtonLabel } from "./fpElevatorLabels";

describe("floorButtonLabel", () => {
  it("uses PR for ground level indices", () => {
    expect(floorButtonLabel(0)).toBe("PR");
    expect(floorButtonLabel(1)).toBe("PR");
  });

  it("uses numeric string for upper levels", () => {
    expect(floorButtonLabel(2)).toBe("2");
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

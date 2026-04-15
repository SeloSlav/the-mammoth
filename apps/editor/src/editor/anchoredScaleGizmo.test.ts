import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  anchoredScaleAnchorLocalPoint,
  anchoredScaleAxisFromTransformAxis,
  computeAnchoredScalePosition,
} from "./anchoredScaleGizmo.js";

describe("anchoredScaleGizmo", () => {
  it("maps supported transform axes", () => {
    expect(anchoredScaleAxisFromTransformAxis("X")).toBe("X");
    expect(anchoredScaleAxisFromTransformAxis("YZ")).toBe("YZ");
    expect(anchoredScaleAxisFromTransformAxis("XYZ")).toBeNull();
    expect(anchoredScaleAxisFromTransformAxis(null)).toBeNull();
  });

  it("anchors the dragged axis to the local minimum face", () => {
    const anchor = anchoredScaleAnchorLocalPoint({
      axis: "X",
      localBounds: new THREE.Box3(new THREE.Vector3(-2, -3, -4), new THREE.Vector3(5, 7, 9)),
    });
    expect(anchor.toArray()).toEqual([-2, 2, 2.5]);
  });

  it("moves the object so the anchored face stays fixed", () => {
    const next = computeAnchoredScalePosition({
      startPosition: new THREE.Vector3(10, 0, 0),
      startScale: new THREE.Vector3(1, 1, 1),
      currentScale: new THREE.Vector3(1.5, 1, 1),
      rotation: new THREE.Quaternion(),
      anchorLocalPoint: new THREE.Vector3(-2, 0, 0),
    });
    expect(next.toArray()).toEqual([11, 0, 0]);
  });

  it("applies anchored movement in the rotated local axis", () => {
    const next = computeAnchoredScalePosition({
      startPosition: new THREE.Vector3(0, 0, 0),
      startScale: new THREE.Vector3(1, 1, 1),
      currentScale: new THREE.Vector3(2, 1, 1),
      rotation: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI * 0.5,
      ),
      anchorLocalPoint: new THREE.Vector3(-1, 0, 0),
    });
    expect(next.x).toBeCloseTo(0);
    expect(next.z).toBeCloseTo(-1);
  });
});

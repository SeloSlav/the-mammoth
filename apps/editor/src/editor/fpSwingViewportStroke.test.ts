import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  eulerRadFromTangentLocal,
  resamplePolylineByArcLength,
  swingKeyframesFromOffsetPolyline,
} from "./fpSwingViewportStroke.js";

describe("fpSwingViewportStroke", () => {
  it("resamplePolylineByArcLength places endpoints", () => {
    const poly = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 1, 0)];
    const r = resamplePolylineByArcLength(poly, 3);
    expect(r.length).toBe(3);
    expect(r[0]!.x).toBeCloseTo(0, 5);
    expect(r[2]!.x).toBeCloseTo(1, 5);
    expect(r[2]!.y).toBeCloseTo(1, 5);
  });

  it("eulerRadFromTangentLocal handles forward-ish tangents", () => {
    const e = eulerRadFromTangentLocal(new THREE.Vector3(0, 0, -1));
    expect(Math.abs(e.x)).toBeLessThan(0.01);
    expect(Math.abs(Math.sin(e.y))).toBeLessThan(1e-4);
    const eSide = eulerRadFromTangentLocal(new THREE.Vector3(1, 0, 0));
    expect(eSide.y).toBeCloseTo(Math.PI / 2, 4);
  });

  it("swingKeyframesFromOffsetPolyline ends at rest", () => {
    const rel = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.1, -0.2, -0.3),
      new THREE.Vector3(0.05, -0.1, -0.15),
    ];
    const keys = swingKeyframesFromOffsetPolyline(rel, { sampleCount: 5 });
    expect(keys.length).toBeGreaterThanOrEqual(3);
    const last = keys[keys.length - 1]!;
    expect(last.t).toBe(1);
    expect(last.translationM.x).toBe(0);
    expect(last.translationM.y).toBe(0);
    expect(last.translationM.z).toBe(0);
    expect(keys[0]!.t).toBe(0);
  });
});

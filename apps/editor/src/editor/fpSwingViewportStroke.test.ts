import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { resamplePolylineByArcLength, swingKeyframesFromOffsetPolyline } from "./fpSwingViewportStroke.js";

describe("fpSwingViewportStroke", () => {
  it("resamplePolylineByArcLength places endpoints", () => {
    const poly = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 1, 0)];
    const r = resamplePolylineByArcLength(poly, 3);
    expect(r.length).toBe(3);
    expect(r[0]!.x).toBeCloseTo(0, 5);
    expect(r[2]!.x).toBeCloseTo(1, 5);
    expect(r[2]!.y).toBeCloseTo(1, 5);
  });

  it("swingKeyframesFromOffsetPolyline uses translation only (no tangent rotation)", () => {
    const rel = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.1, -0.2, -0.3),
      new THREE.Vector3(0.05, -0.1, -0.15),
    ];
    const keys = swingKeyframesFromOffsetPolyline(rel, { sampleCount: 5 });
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (const k of keys) {
      expect(k.rotationRad.x).toBe(0);
      expect(k.rotationRad.y).toBe(0);
      expect(k.rotationRad.z).toBe(0);
    }
    const last = keys[keys.length - 1]!;
    expect(last.t).toBe(1);
    expect(last.translationM.x).toBe(0);
    expect(last.translationM.y).toBe(0);
    expect(last.translationM.z).toBe(0);
    expect(keys[0]!.t).toBe(0);
  });
});

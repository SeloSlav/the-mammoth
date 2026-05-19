import { describe, expect, it } from "vitest";
import {
  EDITOR_ORBIT_INVARIANT_REFERENCE_DISTANCE_M,
  EDITOR_ORBIT_MIN_DISTANCE_M,
  EDITOR_ORBIT_SPEED_DISTANCE_COMPENSATION_DAMP,
  editorOrbitDistanceInvariantSpeeds,
} from "./editorOrbitDistanceInvariantSpeeds.js";

describe("editorOrbitDistanceInvariantSpeeds", () => {
  it("raises pan speed when zoomed in close", () => {
    const close = editorOrbitDistanceInvariantSpeeds({
      distanceM: EDITOR_ORBIT_MIN_DISTANCE_M,
      minDistanceM: EDITOR_ORBIT_MIN_DISTANCE_M,
    });
    const neutral = editorOrbitDistanceInvariantSpeeds({
      distanceM: EDITOR_ORBIT_INVARIANT_REFERENCE_DISTANCE_M,
      minDistanceM: EDITOR_ORBIT_MIN_DISTANCE_M,
    });

    expect(close.panSpeed).toBeGreaterThan(neutral.panSpeed * 3);
    expect(close.panSpeed).toBeGreaterThan(30);
  });

  it("keeps similar effective pan scale across near and reference distances", () => {
    const minDistanceM = EDITOR_ORBIT_MIN_DISTANCE_M;
    const close = editorOrbitDistanceInvariantSpeeds({
      distanceM: EDITOR_ORBIT_MIN_DISTANCE_M,
      minDistanceM,
    });
    const neutral = editorOrbitDistanceInvariantSpeeds({
      distanceM: EDITOR_ORBIT_INVARIANT_REFERENCE_DISTANCE_M,
      minDistanceM,
    });

    const closeEffective = EDITOR_ORBIT_MIN_DISTANCE_M * close.panSpeed;
    const neutralEffective =
      EDITOR_ORBIT_INVARIANT_REFERENCE_DISTANCE_M * neutral.panSpeed;
    expect(closeEffective).toBeCloseTo(neutralEffective, 1);
  });

  it("softens pan when zoomed far out", () => {
    const far = editorOrbitDistanceInvariantSpeeds({
      distanceM: 40,
      minDistanceM: EDITOR_ORBIT_MIN_DISTANCE_M,
    });
    const neutral = editorOrbitDistanceInvariantSpeeds({
      distanceM: EDITOR_ORBIT_INVARIANT_REFERENCE_DISTANCE_M,
      minDistanceM: EDITOR_ORBIT_MIN_DISTANCE_M,
    });
    expect(far.panSpeed).toBeLessThan(neutral.panSpeed);
    expect(far.panSpeed).toBeGreaterThanOrEqual(0.12);
  });

  it("applies dampening factor", () => {
    const undamped = editorOrbitDistanceInvariantSpeeds({
      distanceM: EDITOR_ORBIT_INVARIANT_REFERENCE_DISTANCE_M,
      minDistanceM: EDITOR_ORBIT_MIN_DISTANCE_M,
      damp: 1,
    });
    const damped = editorOrbitDistanceInvariantSpeeds({
      distanceM: EDITOR_ORBIT_INVARIANT_REFERENCE_DISTANCE_M,
      minDistanceM: EDITOR_ORBIT_MIN_DISTANCE_M,
      damp: EDITOR_ORBIT_SPEED_DISTANCE_COMPENSATION_DAMP,
    });
    expect(damped.rotateSpeed).toBeCloseTo(undamped.rotateSpeed * EDITOR_ORBIT_SPEED_DISTANCE_COMPENSATION_DAMP);
  });
});

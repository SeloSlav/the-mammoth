import { describe, expect, it } from "vitest";
import {
  createFpLookInertiaState,
  resetFpLookInertia,
  stepFpFreeLookRecenter,
  stepFpLookInertia,
  type FpLookAngleState,
} from "./fpSessionCameraLook.js";
import { FREE_LOOK_RECENTER_RATE_PER_S, MOUSE_SENS } from "./fpSessionConstants.js";

const DT = 1 / 60;

function instantLookStep(
  angles: FpLookAngleState,
  deltaX: number,
  deltaY: number,
  freeLook: boolean,
): void {
  if (freeLook) {
    angles.headLookYaw -= deltaX * MOUSE_SENS;
  } else {
    angles.bodyYaw -= deltaX * MOUSE_SENS;
  }
  angles.pitch -= deltaY * MOUSE_SENS;
}

describe("fpSessionCameraLook", () => {
  it("matches instant sensitivity under steady horizontal drag", () => {
    const inertia = createFpLookInertiaState();
    const smoothed: FpLookAngleState = { bodyYaw: 0, pitch: 0, headLookYaw: 0 };
    const instant: FpLookAngleState = { bodyYaw: 0, pitch: 0, headLookYaw: 0 };
    const deltaX = -14;

    for (let i = 0; i < 120; i += 1) {
      stepFpLookInertia(inertia, smoothed, deltaX, 0, DT, { freeLook: false });
      instantLookStep(instant, deltaX, 0, false);
    }

    expect(smoothed.bodyYaw).toBeCloseTo(instant.bodyYaw, 6);
  });

  it("coasts after the mouse stops", () => {
    const inertia = createFpLookInertiaState();
    const angles: FpLookAngleState = { bodyYaw: 0, pitch: 0, headLookYaw: 0 };
    const flickX = -120;

    stepFpLookInertia(inertia, angles, flickX, 0, DT, { freeLook: false });
    const yawAfterFlick = angles.bodyYaw;

    stepFpLookInertia(inertia, angles, 0, 0, DT, { freeLook: false });
    expect(Math.abs(angles.bodyYaw - yawAfterFlick)).toBeGreaterThan(1e-5);

    resetFpLookInertia(inertia);
    angles.bodyYaw = 0;
    stepFpLookInertia(inertia, angles, flickX, 0, DT, { freeLook: false });
    let coastFrames = 0;
    while (coastFrames < 30) {
      const prev = angles.bodyYaw;
      stepFpLookInertia(inertia, angles, 0, 0, DT, { freeLook: false });
      if (Math.abs(angles.bodyYaw - prev) > 1e-6) coastFrames += 1;
      else break;
    }
    expect(coastFrames).toBeGreaterThan(0);
  });

  it("routes horizontal inertia to Alt free-look head yaw", () => {
    const inertia = createFpLookInertiaState();
    const angles: FpLookAngleState = { bodyYaw: 0.5, pitch: 0, headLookYaw: 0 };

    stepFpLookInertia(inertia, angles, -40, 0, DT, { freeLook: true });
    stepFpLookInertia(inertia, angles, 0, 0, DT, { freeLook: true });

    expect(angles.bodyYaw).toBe(0.5);
    expect(angles.headLookYaw).not.toBe(0);
  });

  it("eases head yaw toward zero after Alt free-look ends", () => {
    const angles: FpLookAngleState = { bodyYaw: 0.4, pitch: 0, headLookYaw: 1.1 };
    const start = angles.headLookYaw;

    stepFpFreeLookRecenter(angles, DT);
    expect(angles.bodyYaw).toBe(0.4);
    expect(Math.abs(angles.headLookYaw)).toBeLessThan(Math.abs(start));
    expect(angles.headLookYaw).toBeCloseTo(start * Math.exp(-FREE_LOOK_RECENTER_RATE_PER_S * DT), 8);

    for (let i = 0; i < 240; i += 1) {
      if (!stepFpFreeLookRecenter(angles, DT)) break;
    }
    expect(angles.headLookYaw).toBe(0);
  });

  it("zeros pitch velocity at the clamp", () => {
    const inertia = createFpLookInertiaState();
    const angles: FpLookAngleState = { bodyYaw: 0, pitch: 1.52, headLookYaw: 0 };

    stepFpLookInertia(inertia, angles, 0, -800, DT, { freeLook: false });
    stepFpLookInertia(inertia, angles, 0, 0, DT, { freeLook: false });

    expect(angles.pitch).toBeLessThanOrEqual(1.53);
    expect(inertia.velPitch).toBe(0);
  });

  it("applies pointer deltas immediately even when dt is zero", () => {
    const inertia = createFpLookInertiaState();
    const angles: FpLookAngleState = { bodyYaw: 0, pitch: 0, headLookYaw: 0 };

    stepFpLookInertia(inertia, angles, -12, 4, 0, { freeLook: false });

    expect(angles.bodyYaw).toBeCloseTo(12 * MOUSE_SENS, 8);
    expect(angles.pitch).toBeCloseTo(-4 * MOUSE_SENS, 8);
  });
});

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  FP_COMBAT_AIM_FOV_DEG,
  FP_COMBAT_HIP_FOV_DEG,
  publishFpSessionCombatAiming,
  resetFpSessionCombatAiming,
  snapFpCombatAimFov,
  stepFpCombatAimFov,
  subscribeFpSessionCombatAiming,
} from "./fpSessionCombatAim.js";

describe("stepFpCombatAimFov", () => {
  it("eases toward ADS FOV while aim is held", () => {
    const camera = new THREE.PerspectiveCamera(FP_COMBAT_HIP_FOV_DEG, 16 / 9, 0.05, 900);
    stepFpCombatAimFov(camera, true, 0.25);
    expect(camera.fov).toBeLessThan(FP_COMBAT_HIP_FOV_DEG);
    expect(camera.fov).toBeGreaterThan(FP_COMBAT_AIM_FOV_DEG);
  });

  it("returns toward hip FOV when aim is released", () => {
    const camera = new THREE.PerspectiveCamera(FP_COMBAT_AIM_FOV_DEG, 16 / 9, 0.05, 900);
    stepFpCombatAimFov(camera, false, 0.25);
    expect(camera.fov).toBeGreaterThan(FP_COMBAT_AIM_FOV_DEG);
    expect(camera.fov).toBeLessThan(FP_COMBAT_HIP_FOV_DEG);
  });
});

describe("snapFpCombatAimFov", () => {
  it("sets ADS FOV immediately", () => {
    const camera = new THREE.PerspectiveCamera(FP_COMBAT_HIP_FOV_DEG, 16 / 9, 0.05, 900);
    snapFpCombatAimFov(camera, true);
    expect(camera.fov).toBe(FP_COMBAT_AIM_FOV_DEG);
  });

  it("sets hip FOV immediately", () => {
    const camera = new THREE.PerspectiveCamera(FP_COMBAT_AIM_FOV_DEG, 16 / 9, 0.05, 900);
    snapFpCombatAimFov(camera, false);
    expect(camera.fov).toBe(FP_COMBAT_HIP_FOV_DEG);
  });
});

describe("publishFpSessionCombatAiming", () => {
  it("notifies subscribers on transitions only", () => {
    resetFpSessionCombatAiming();
    let calls = 0;
    const unsub = subscribeFpSessionCombatAiming(() => {
      calls += 1;
    });
    publishFpSessionCombatAiming(true);
    publishFpSessionCombatAiming(true);
    publishFpSessionCombatAiming(false);
    unsub();
    expect(calls).toBe(2);
  });
});

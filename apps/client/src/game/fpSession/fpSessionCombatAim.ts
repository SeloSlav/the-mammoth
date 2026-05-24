import * as THREE from "three";
import { fpLocomotionConstants } from "@the-mammoth/engine";

/** Default hip-fire vertical FOV (degrees) — matches {@link fpLocomotionConstants.cameraFovDeg}. */
export const FP_COMBAT_HIP_FOV_DEG = fpLocomotionConstants.cameraFovDeg;

/** Narrower FOV while holding RMB with a ranged weapon equipped (degrees). */
export const FP_COMBAT_AIM_FOV_DEG = 38;

/** Exponential ease rate (1/s) for FOV transitions in/out of ADS. */
export const FP_COMBAT_AIM_FOV_DAMP_PER_S = 14;

let combatAiming = false;
const listeners = new Set<() => void>();

export function isFpSessionCombatAiming(): boolean {
  return combatAiming;
}

export function subscribeFpSessionCombatAiming(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function publishFpSessionCombatAiming(active: boolean): void {
  if (combatAiming === active) return;
  combatAiming = active;
  if (listeners.size === 0) return;
  for (const l of listeners) l();
}

export function resetFpSessionCombatAiming(): void {
  publishFpSessionCombatAiming(false);
}

/**
 * Smoothly lerps the gameplay camera FOV toward hip or ADS based on {@link aimHeld}.
 * Mutates `camera.fov` and calls `updateProjectionMatrix` when the value changes.
 */
export function stepFpCombatAimFov(
  camera: THREE.PerspectiveCamera,
  aimHeld: boolean,
  dtSec: number,
): void {
  const targetFov = aimHeld ? FP_COMBAT_AIM_FOV_DEG : FP_COMBAT_HIP_FOV_DEG;
  const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, FP_COMBAT_AIM_FOV_DAMP_PER_S, dtSec);
  if (Math.abs(nextFov - camera.fov) < 1e-4) return;
  camera.fov = nextFov;
  camera.updateProjectionMatrix();
}

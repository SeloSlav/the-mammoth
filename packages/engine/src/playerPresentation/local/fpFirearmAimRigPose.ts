import * as THREE from "three";
import { clampFpRigRootPositionInPlace } from "../../weapons/weaponPrimitiveAuthoring.js";
import type { WeaponAuthorVec3 } from "../../weapons/weaponPrimitiveAuthoring.js";

/** Tuning for hip → ADS rig derivation when `fpViewmodel.aimRigRoot` is omitted. */
export const FP_FIREARM_AIM_RIG_DERIVE = {
  /** Horizontal pull toward screen center (meters, head-pitch space). */
  centerXM: 0.045,
  /** Raise relative to hip rest (meters). */
  raiseYM: 0.08,
  /** Forward depth toward the lens while ADS (meters, −Z = into view). */
  forwardZM: -0.52,
  /** Unwind fraction of hip `rigRoot` roll toward {@link targetRollZRad}. */
  unwindRollFactor: 0.92,
  /** Residual roll when squared up to the camera (radians). */
  targetRollZRad: -0.12,
  /** Slight downward pitch while ADS (radians). */
  pitchDownXRad: 0.055,
} as const;

export function smoothStep01(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Derives a centered ADS rig pose from the authored hip `rigRoot`. Weapons may override with
 * explicit `fpViewmodel.aimRigRoot` in presentation JSON.
 */
export function deriveFpFirearmAimRigRootFromHip(
  hipPos: Readonly<WeaponAuthorVec3>,
  hipEuler: Readonly<WeaponAuthorVec3>,
): { positionM: WeaponAuthorVec3; eulerRad: WeaponAuthorVec3 } {
  const positionM: WeaponAuthorVec3 = {
    x: THREE.MathUtils.lerp(hipPos.x, FP_FIREARM_AIM_RIG_DERIVE.centerXM, 0.93),
    y: THREE.MathUtils.lerp(hipPos.y, hipPos.y + FP_FIREARM_AIM_RIG_DERIVE.raiseYM, 0.8),
    z: THREE.MathUtils.lerp(hipPos.z, FP_FIREARM_AIM_RIG_DERIVE.forwardZM, 0.7),
  };
  const posVec = new THREE.Vector3(positionM.x, positionM.y, positionM.z);
  clampFpRigRootPositionInPlace(posVec);
  positionM.x = posVec.x;
  positionM.y = posVec.y;
  positionM.z = posVec.z;

  const eulerRad: WeaponAuthorVec3 = {
    x: THREE.MathUtils.lerp(hipEuler.x, FP_FIREARM_AIM_RIG_DERIVE.pitchDownXRad, 0.85),
    y: THREE.MathUtils.lerp(hipEuler.y, 0, 0.9),
    z:
      hipEuler.z +
      (FP_FIREARM_AIM_RIG_DERIVE.targetRollZRad - hipEuler.z) *
        FP_FIREARM_AIM_RIG_DERIVE.unwindRollFactor,
  };
  return { positionM, eulerRad };
}

import * as THREE from "three";
import { clampFpRigRootPositionInPlace } from "../../weapons/weaponPrimitiveAuthoring.js";
import type { WeaponAuthorVec3 } from "../../weapons/weaponPrimitiveAuthoring.js";

/** Tuning for hip → ADS rig derivation when `fpViewmodel.aimRigRoot` is omitted. */
export const FP_FIREARM_AIM_RIG_DERIVE = {
  /** How much of the hip X offset to keep (1 = no horizontal pull). */
  hipCenterXRetain: 0.62,
  /** Raise relative to hip rest (meters). */
  raiseYM: 0.05,
  /** Forward depth toward the lens while ADS (meters, −Z = into view). */
  forwardZM: -0.48,
  /** Fraction of hip roll kept — ADS should stay canted like the carry pose, not go flat. */
  hipRollRetain: 0.9,
  /** Small extra roll nudge after retain (radians). */
  rollNudgeZRad: 0.06,
  /** Slight downward pitch while ADS (radians). */
  pitchDownXRad: 0.035,
  /** Small inward yaw so the barrel squares toward the lens without banking flat. */
  yawInYRad: 0.05,
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
    x: hipPos.x * FP_FIREARM_AIM_RIG_DERIVE.hipCenterXRetain,
    y: THREE.MathUtils.lerp(hipPos.y, hipPos.y + FP_FIREARM_AIM_RIG_DERIVE.raiseYM, 0.65),
    z: THREE.MathUtils.lerp(hipPos.z, FP_FIREARM_AIM_RIG_DERIVE.forwardZM, 0.55),
  };
  const posVec = new THREE.Vector3(positionM.x, positionM.y, positionM.z);
  clampFpRigRootPositionInPlace(posVec);
  positionM.x = posVec.x;
  positionM.y = posVec.y;
  positionM.z = posVec.z;

  const eulerRad: WeaponAuthorVec3 = {
    x: THREE.MathUtils.lerp(hipEuler.x, FP_FIREARM_AIM_RIG_DERIVE.pitchDownXRad, 0.5),
    y: THREE.MathUtils.lerp(hipEuler.y, FP_FIREARM_AIM_RIG_DERIVE.yawInYRad, 0.55),
    z: hipEuler.z * FP_FIREARM_AIM_RIG_DERIVE.hipRollRetain + FP_FIREARM_AIM_RIG_DERIVE.rollNudgeZRad,
  };
  return { positionM, eulerRad };
}

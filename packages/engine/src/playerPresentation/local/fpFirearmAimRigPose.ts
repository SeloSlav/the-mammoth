import * as THREE from "three";
import { clampFpRigRootPositionInPlace } from "../../weapons/weaponPrimitiveAuthoring.js";
import type { WeaponAuthorVec3 } from "../../weapons/weaponPrimitiveAuthoring.js";

/** Tuning for hip → ADS rig derivation when `fpViewmodel.aimRigRoot` is omitted. */
export const FP_FIREARM_AIM_RIG_DERIVE = {
  /** Pull hip X toward screen center (0 = full center, 1 = keep hip X). */
  hipCenterXRetain: 0.38,
  /** Drop relative to hip rest (meters) — keeps hand low, muzzle under reticle. */
  lowerYM: 0.028,
  /** Nudge rig deeper into the view from hip (meters, −Z = into scene). */
  depthExtraZM: -0.035,
  /** Fraction of hip roll kept — ADS stays in the same cant family as hip fire. */
  hipRollRetain: 0.96,
  /** Small extra roll nudge after retain (radians). */
  rollNudgeZRad: 0.02,
  /** Slight pitch-up while ADS (radians). */
  pitchUpXRad: -0.02,
  /** Small inward yaw (radians). */
  yawInYRad: 0.03,
} as const;

export function smoothStep01(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Derives a centered ADS rig pose from the authored hip `rigRoot`. Weapons should override with
 * explicit `fpViewmodel.aimRigRoot` in presentation JSON.
 */
export function deriveFpFirearmAimRigRootFromHip(
  hipPos: Readonly<WeaponAuthorVec3>,
  hipEuler: Readonly<WeaponAuthorVec3>,
): { positionM: WeaponAuthorVec3; eulerRad: WeaponAuthorVec3 } {
  const positionM: WeaponAuthorVec3 = {
    x: hipPos.x * FP_FIREARM_AIM_RIG_DERIVE.hipCenterXRetain,
    y: hipPos.y - FP_FIREARM_AIM_RIG_DERIVE.lowerYM,
    z: hipPos.z + FP_FIREARM_AIM_RIG_DERIVE.depthExtraZM,
  };
  const posVec = new THREE.Vector3(positionM.x, positionM.y, positionM.z);
  clampFpRigRootPositionInPlace(posVec);
  positionM.x = posVec.x;
  positionM.y = posVec.y;
  positionM.z = posVec.z;

  const eulerRad: WeaponAuthorVec3 = {
    x: THREE.MathUtils.lerp(hipEuler.x, FP_FIREARM_AIM_RIG_DERIVE.pitchUpXRad, 0.45),
    y: THREE.MathUtils.lerp(hipEuler.y, FP_FIREARM_AIM_RIG_DERIVE.yawInYRad, 0.45),
    z: hipEuler.z * FP_FIREARM_AIM_RIG_DERIVE.hipRollRetain + FP_FIREARM_AIM_RIG_DERIVE.rollNudgeZRad,
  };
  return { positionM, eulerRad };
}

import * as THREE from "three";
import {
  FP_RIG_ROOT_XZ_MAX_ABS_M,
  FP_RIG_ROOT_Y_MAX_M,
  FP_RIG_ROOT_Y_MIN_M,
} from "../../weapons/weaponPrimitiveAuthoring.js";

/**
 * Max α∈(0,1] so `rest + α·delta` stays inside the FP rig authoring box (asymmetric on Y).
 */
export function largestValidAuthoringRigRestStep(
  rest: THREE.Vector3,
  delta: THREE.Vector3,
): number {
  const capXz = FP_RIG_ROOT_XZ_MAX_ABS_M * 0.999;
  const yLo = FP_RIG_ROOT_Y_MIN_M;
  const yHi = FP_RIG_ROOT_Y_MAX_M;
  let t = 1;
  for (let k = 0; k < 28; k++) {
    const nx = rest.x + t * delta.x;
    const ny = rest.y + t * delta.y;
    const nz = rest.z + t * delta.z;
    if (Math.abs(nx) <= capXz && Math.abs(nz) <= capXz && ny >= yLo && ny <= yHi) {
      return t;
    }
    t *= 0.5;
  }
  return 0;
}

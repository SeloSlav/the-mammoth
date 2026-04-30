import * as THREE from "three";

const _mirrorCenter = new THREE.Vector3();
const _toMirror = new THREE.Vector3();

export type CabMirrorReflectionGateOpts = {
  maxDistanceM?: number;
  minFacingDot?: number;
};

/**
 * Forward-alignment score for a cab mirror, or `-1` when outside the distance / cone gate.
 * Used to pick a single mirror per frame to redraw (two mirrors → two full scene passes otherwise).
 */
export function cabMirrorReflectionFacingScore(
  surface: THREE.Mesh,
  cameraWorld: THREE.Vector3,
  cameraForward: THREE.Vector3,
  opts?: CabMirrorReflectionGateOpts,
): number {
  const maxDistanceM = opts?.maxDistanceM ?? 26;
  const minFacingDot = opts?.minFacingDot ?? 0.14;
  surface.getWorldPosition(_mirrorCenter);
  _toMirror.subVectors(_mirrorCenter, cameraWorld);
  const distSq = _toMirror.lengthSq();
  if (distSq > maxDistanceM * maxDistanceM) return -1;
  const invLen = 1 / Math.sqrt(Math.max(distSq, 1e-8));
  const fx = _toMirror.x * invLen;
  const fy = _toMirror.y * invLen;
  const fz = _toMirror.z * invLen;
  const facing = fx * cameraForward.x + fy * cameraForward.y + fz * cameraForward.z;
  if (facing <= minFacingDot) return -1;
  return facing;
}

/**
 * Skip planar-reflection redraw when the mirror sits outside a cheap forward cone + distance band.
 * Each {@link reflector} `forceUpdate` can otherwise replay the full FP scene (cab interiors often
 * have two mirrors → two extra full passes per frame).
 */
export function cabMirrorReflectionWorthUpdating(
  surface: THREE.Mesh,
  cameraWorld: THREE.Vector3,
  cameraForward: THREE.Vector3,
  opts?: CabMirrorReflectionGateOpts,
): boolean {
  return cabMirrorReflectionFacingScore(surface, cameraWorld, cameraForward, opts) >= 0;
}

export type CabMirrorPickPrimaryArgs = {
  cameraWorld: THREE.Vector3;
  cameraForward: THREE.Vector3;
  opts?: CabMirrorReflectionGateOpts;
  /**
   * When `abs(cameraForward.y) >=` this value, return `-1`: planar mirrors contribute nothing useful
   * for stair-shaft up/down views but each forced reflection replay duplicates the whole FP scene's
   * draw count (~2× `renderer.info.render.calls`).
   */
  skipReflectionWhenVerticalLookAboveAbsY?: number;
};

/** Default gate for {@link CabMirrorPickPrimaryArgs.skipReflectionWhenVerticalLookAboveAbsY}. */
export const FP_CAB_MIRROR_SKIP_REFLECTION_ABS_FORWARD_Y = 0.62;
/** Redraw cab mirror reflections at 12 Hz; the cached texture is reused between updates. */
export const FP_CAB_MIRROR_REFLECTION_UPDATE_INTERVAL_MS = 83;

/**
 * Index of the mirror that should receive a fresh reflection this frame (`-1` if none).
 * Ensures at most one cab mirror runs a full scene pass per frame.
 */
export function pickCabMirrorPrimaryUpdateIndex(
  mirrors: readonly { surface: THREE.Mesh }[],
  {
    cameraWorld,
    cameraForward,
    opts,
    skipReflectionWhenVerticalLookAboveAbsY,
  }: CabMirrorPickPrimaryArgs,
): number {
  if (
    typeof skipReflectionWhenVerticalLookAboveAbsY === "number" &&
    Number.isFinite(skipReflectionWhenVerticalLookAboveAbsY) &&
    Math.abs(cameraForward.y) >= skipReflectionWhenVerticalLookAboveAbsY
  ) {
    return -1;
  }
  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < mirrors.length; i++) {
    const surface = mirrors[i]!.surface;
    if (!surface.visible) continue;
    const score = cabMirrorReflectionFacingScore(surface, cameraWorld, cameraForward, opts);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

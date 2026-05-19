import * as THREE from "three";
import { MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY } from "@the-mammoth/world";

const _mirrorCenter = new THREE.Vector3();
const _toMirror = new THREE.Vector3();
const _mirrorBounds = new THREE.Box3();

/** Cab interior — tight volume, mirror is always relevant when facing it. */
export const FP_CAB_MIRROR_REFLECTION_MAX_DISTANCE_M = 4.5;
export const FP_CAB_MIRROR_REFLECTION_MIN_FACING_DOT = 0.22;

/**
 * Apartment mirrors — strict gate: only while inside the same unit, on-screen, and looking at the glass.
 * Avoids replaying the full FP scene (~2× draw cost) from the living room.
 */
export const FP_APARTMENT_MIRROR_REFLECTION_MAX_DISTANCE_M = 1.6;
export const FP_APARTMENT_MIRROR_REFLECTION_MIN_FACING_DOT = 0.62;
/** Lower RT resolution than cab (reflection omits decor layer but shell pass is still costly). */
export const FP_APARTMENT_MIRROR_REFLECTION_RESOLUTION_SCALE = 0.28;
/** ~2.5 Hz reflection refresh when an apartment mirror is primary (cab stays ~12 Hz). */
export const FP_APARTMENT_MIRROR_REFLECTION_UPDATE_INTERVAL_MS = 400;

/** Score bias so elevator mirrors win when both are eligible. */
const FP_CAB_MIRROR_SCORE_BIAS = 1000;

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
  /** Required for apartment mirrors — must match `mammothApartmentUnitKey` on the mirror root. */
  containingResidentialUnitKey?: string | null;
  /** When set, apartment mirrors must intersect the view frustum (occlusion / off-screen). */
  viewFrustum?: THREE.Frustum;
};

function isApartmentPlanarMirrorSurface(surface: THREE.Mesh): boolean {
  return surface.userData[MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY] === true;
}

function apartmentMirrorUnitKeyFromSurface(surface: THREE.Mesh): string | null {
  let o: THREE.Object3D | null = surface;
  while (o) {
    const k = o.userData.mammothApartmentUnitKey;
    if (typeof k === "string" && k.length > 0) return k;
    o = o.parent;
  }
  return null;
}

function isVisibleInParentChain(obj: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

function mirrorGateOptsForSurface(
  surface: THREE.Mesh,
  fallback?: CabMirrorReflectionGateOpts,
): CabMirrorReflectionGateOpts {
  if (isApartmentPlanarMirrorSurface(surface)) {
    return {
      maxDistanceM: FP_APARTMENT_MIRROR_REFLECTION_MAX_DISTANCE_M,
      minFacingDot: FP_APARTMENT_MIRROR_REFLECTION_MIN_FACING_DOT,
    };
  }
  return (
    fallback ?? {
      maxDistanceM: FP_CAB_MIRROR_REFLECTION_MAX_DISTANCE_M,
      minFacingDot: FP_CAB_MIRROR_REFLECTION_MIN_FACING_DOT,
    }
  );
}

function apartmentMirrorPassesContextGate(
  surface: THREE.Mesh,
  args: CabMirrorPickPrimaryArgs,
): boolean {
  if (!isApartmentPlanarMirrorSurface(surface)) return true;
  const unitKey = apartmentMirrorUnitKeyFromSurface(surface);
  if (
    !args.containingResidentialUnitKey ||
    !unitKey ||
    unitKey !== args.containingResidentialUnitKey
  ) {
    return false;
  }
  if (!isVisibleInParentChain(surface)) return false;
  if (args.viewFrustum) {
    surface.updateMatrixWorld(true);
    _mirrorBounds.setFromObject(surface);
    if (_mirrorBounds.isEmpty() || !args.viewFrustum.intersectsBox(_mirrorBounds)) {
      return false;
    }
  }
  return true;
}

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
  pickArgs: CabMirrorPickPrimaryArgs,
): number {
  const { cameraWorld, cameraForward, opts, skipReflectionWhenVerticalLookAboveAbsY } =
    pickArgs;
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
    if (!apartmentMirrorPassesContextGate(surface, pickArgs)) continue;
    const gateOpts = mirrorGateOptsForSurface(surface, opts);
    let score = cabMirrorReflectionFacingScore(
      surface,
      cameraWorld,
      cameraForward,
      gateOpts,
    );
    if (score < 0) continue;
    if (!isApartmentPlanarMirrorSurface(surface)) {
      score += FP_CAB_MIRROR_SCORE_BIAS;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function isFpApartmentPlanarMirrorSurface(surface: THREE.Mesh): boolean {
  return isApartmentPlanarMirrorSurface(surface);
}

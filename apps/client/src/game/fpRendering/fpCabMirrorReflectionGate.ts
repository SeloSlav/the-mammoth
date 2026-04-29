import * as THREE from "three";

const _mirrorCenter = new THREE.Vector3();
const _toMirror = new THREE.Vector3();

/**
 * Skip planar-reflection redraw when the mirror sits outside a cheap forward cone + distance band.
 * Each {@link reflector} `forceUpdate` can otherwise replay the full FP scene (cab interiors often
 * have two mirrors → two extra full passes per frame).
 */
export function cabMirrorReflectionWorthUpdating(
  surface: THREE.Mesh,
  cameraWorld: THREE.Vector3,
  cameraForward: THREE.Vector3,
  opts?: { maxDistanceM?: number; minFacingDot?: number },
): boolean {
  const maxDistanceM = opts?.maxDistanceM ?? 26;
  const minFacingDot = opts?.minFacingDot ?? 0.14;
  surface.getWorldPosition(_mirrorCenter);
  _toMirror.subVectors(_mirrorCenter, cameraWorld);
  const distSq = _toMirror.lengthSq();
  if (distSq > maxDistanceM * maxDistanceM) return false;
  const invLen = 1 / Math.sqrt(Math.max(distSq, 1e-8));
  const fx = _toMirror.x * invLen;
  const fy = _toMirror.y * invLen;
  const fz = _toMirror.z * invLen;
  const facing = fx * cameraForward.x + fy * cameraForward.y + fz * cameraForward.z;
  return facing > minFacingDot;
}

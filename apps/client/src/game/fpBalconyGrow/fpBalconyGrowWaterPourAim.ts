import * as THREE from "three";

const _aimScratch = new THREE.Vector3();
const _rayScratch = new THREE.Ray();
const _fallbackDirScratch = new THREE.Vector3();

const POUR_FALLBACK_DISTANCE_M = 1.35;

/**
 * Center-screen ray → player's current floor plane (world XZ).
 * Water is an area patch: trays inside the resulting circular patch receive the benefit.
 */
export function resolveBalconyWaterPourAimXz(
  camera: THREE.PerspectiveCamera,
  _decor: unknown,
  feet: THREE.Vector3,
  out: { x: number; z: number },
): boolean {
  _rayScratch.origin.setFromMatrixPosition(camera.matrixWorld);
  camera.getWorldDirection(_rayScratch.direction);

  const dy = _rayScratch.direction.y;
  const t = Math.abs(dy) > 0.0001 ? (feet.y - _rayScratch.origin.y) / dy : Number.NaN;
  if (Number.isFinite(t) && t > 0.05) {
    _rayScratch.at(t, _aimScratch);
    out.x = _aimScratch.x;
    out.z = _aimScratch.z;
    return true;
  }

  camera.getWorldDirection(_fallbackDirScratch);
  _fallbackDirScratch.y = 0;
  if (_fallbackDirScratch.lengthSq() < 0.0001) return false;
  _fallbackDirScratch.normalize();
  out.x = feet.x + _fallbackDirScratch.x * POUR_FALLBACK_DISTANCE_M;
  out.z = feet.z + _fallbackDirScratch.z * POUR_FALLBACK_DISTANCE_M;
  return true;
}

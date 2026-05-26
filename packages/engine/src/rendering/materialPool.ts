import type * as THREE from "three";

/**
 * Shared `MeshStandardMaterial` (and similar) instances keyed by stable authoring ids.
 */
export function getOrCreateMaterial<T extends THREE.Material>(
  cache: Map<string, T>,
  key: string,
  factory: () => T,
): T {
  let mat = cache.get(key);
  if (!mat) {
    mat = factory();
    cache.set(key, mat);
  }
  return mat;
}

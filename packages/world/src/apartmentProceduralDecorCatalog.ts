import * as THREE from "three";
import {
  APARTMENT_WINDOW_SHUTTER_MODEL_PATH,
  buildApartmentWindowShutterVisual,
  isApartmentWindowShutterModelPath,
} from "./apartmentWindowShutterVisual.js";

/** Catalog paths for decor that is built in code — no GLB/OBJ asset on disk. */
export const APARTMENT_PROCEDURAL_DECOR_MODEL_PATHS = [
  APARTMENT_WINDOW_SHUTTER_MODEL_PATH,
] as const;

export type ApartmentProceduralDecorModelPath =
  (typeof APARTMENT_PROCEDURAL_DECOR_MODEL_PATHS)[number];

export function isProceduralApartmentDecorModelPath(modelRelPath: string): boolean {
  const norm = modelRelPath.trim().replace(/^\/+/u, "").toLowerCase();
  return APARTMENT_PROCEDURAL_DECOR_MODEL_PATHS.some(
    (path) => norm === path.toLowerCase() || norm.endsWith(path.split("/").pop()!.toLowerCase()),
  );
}

/** Merge disk manifest paths with procedural catalog entries (stable sort). */
export function mergeApartmentDecorManifestPaths(
  manifestPaths: readonly string[],
): string[] {
  const merged = new Set<string>(manifestPaths);
  for (const path of APARTMENT_PROCEDURAL_DECOR_MODEL_PATHS) {
    merged.add(path);
  }
  return [...merged].sort((a, b) => a.localeCompare(b));
}

export function buildProceduralApartmentDecorVisual(
  modelRelPath: string,
): THREE.Object3D | null {
  if (isApartmentWindowShutterModelPath(modelRelPath)) {
    return buildApartmentWindowShutterVisual();
  }
  return null;
}

/** Post-load fixes for authored GLBs that need runtime material or mesh surgery. */
export function postProcessApartmentDecorGltfScene(
  _root: THREE.Object3D,
  _modelRelPath: string,
): void {
  // Authored GLBs are expected to carry their final materials and geometry.
}

/**
 * Skip client decor material merge. Editor never merges; game merge breaks Draco/KTX2 GLBs
 * (empty or corrupt geometry after `mergeGeometries`).
 */
export function tagApartmentDecorMeshesSkipMaterialMerge(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.userData.mammothSkipFloorGeometryMerge = true;
    }
  });
}

/** @deprecated Use {@link tagApartmentDecorMeshesSkipMaterialMerge}. */
export function tagProceduralApartmentDecorMeshesSkipMerge(root: THREE.Object3D): void {
  tagApartmentDecorMeshesSkipMaterialMerge(root);
}

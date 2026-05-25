import * as THREE from "three";

function resolveTopPlateLevelIndex(root: THREE.Object3D): number {
  let topPlateLevel = -Infinity;
  for (const ch of root.children) {
    const li = ch.userData.mammothPlateLevelIndex;
    if (typeof li === "number" && li > topPlateLevel) topPlateLevel = li;
  }
  return topPlateLevel;
}

function isTopFloorRoofSilhouetteCeiling(
  mesh: THREE.Mesh,
  root: THREE.Object3D,
  topPlateLevel: number,
): boolean {
  if (topPlateLevel === -Infinity) return false;
  if (
    !mesh.name.startsWith("shell_ceiling") &&
    !mesh.name.startsWith("balcony_shell_ceiling")
  ) {
    return false;
  }
  let ancestor: THREE.Object3D | null = mesh;
  while (ancestor && ancestor.parent !== root) ancestor = ancestor.parent;
  const ancestorLevel = ancestor?.userData.mammothPlateLevelIndex;
  return typeof ancestorLevel === "number" && ancestorLevel === topPlateLevel;
}

/**
 * Login backdrop shows the tower from outside — hide hollow unit/corridor shells tagged
 * `mammothUnitInterior`, but keep facade window glass (`mammothResidentialUnitExteriorGlass`)
 * visible (same rule as `fpResolveUnitInteriorMeshVisible` exterior branch).
 *
 * Top-floor `shell_ceiling_*` / `balcony_shell_ceiling` stay visible — they form the roof
 * silhouette when viewed from the street (see `floorPlaceholderMeshes.ts`).
 */
export function hideUnitInteriorMeshesForExteriorAuthView(root: THREE.Object3D): void {
  const topPlateLevel = resolveTopPlateLevelIndex(root);
  root.traverse((obj) => {
    if (obj.userData.mammothUnitInterior !== true) return;
    if (obj.userData.mammothResidentialUnitExteriorGlass === true) return;
    if (obj instanceof THREE.Mesh && isTopFloorRoofSilhouetteCeiling(obj, root, topPlateLevel)) {
      return;
    }
    obj.visible = false;
  });
}

/** Shared cache roots are reused by `mountFpSession`; reset so FP shell visibility can own the flags. */
export function restoreUnitInteriorMeshVisibilityAfterAuthView(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.userData.mammothUnitInterior === true) {
      obj.visible = true;
    }
  });
}

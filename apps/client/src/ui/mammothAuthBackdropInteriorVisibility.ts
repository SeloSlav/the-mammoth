import * as THREE from "three";

/**
 * Login backdrop shows the tower from outside — hide hollow unit/corridor shells tagged
 * `mammothUnitInterior`, but keep facade window glass (`mammothResidentialUnitExteriorGlass`)
 * visible (same rule as `fpResolveUnitInteriorMeshVisible` exterior branch).
 */
export function hideUnitInteriorMeshesForExteriorAuthView(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.userData.mammothUnitInterior !== true) return;
    if (obj.userData.mammothResidentialUnitExteriorGlass === true) return;
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

import * as THREE from "three";
import { MAMMOTH_CORRIDOR_HALLWAY_SHELL_UD } from "@the-mammoth/world";
import { isResidentialUnitShellPlasterMesh } from "../game/fpSession/fpSessionUnitInteriorShellMeshes.js";

function residentialUnitPlacedObjectIdFromAncestors(obj: THREE.Object3D): string | null {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    const id = cur.userData.mammothPlacedObjectId;
    if (typeof id === "string" && id.startsWith("unit_")) return id;
  }
  return null;
}

/**
 * Auth orbit keeps apartment hollow shells (plaster, hardwood floor, ceiling) readable through
 * façade glass, plus corridor floor/ceiling slabs so the double-loaded bar does not read as gaps
 * between units from the yard. Corridor STEP/Koncar signage and corridor walls stay hidden.
 */
export function shouldKeepUnitInteriorVisibleForAuthBackdrop(obj: THREE.Object3D): boolean {
  if (obj.userData.mammothResidentialUnitExteriorGlass === true) return true;
  if (obj.userData[MAMMOTH_CORRIDOR_HALLWAY_SHELL_UD] === true) return true;
  if (!(obj instanceof THREE.Mesh)) return false;
  if (!isResidentialUnitShellPlasterMesh(obj)) return false;
  return residentialUnitPlacedObjectIdFromAncestors(obj) !== null;
}

/**
 * Login / auth backdrop frames the tower from outside without FP floor-band culling. Hide corridor
 * signage and other anonymous `mammothUnitInterior` meshes; keep owned `unit_*` plaster shells.
 */
export function hideUnitInteriorMeshesForAuthView(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.userData.mammothUnitInterior !== true) return;
    if (shouldKeepUnitInteriorVisibleForAuthBackdrop(obj)) return;
    obj.visible = false;
  });
}

/**
 * Shared megablock cache roots are reused by `mountFpSession`; reset any stale `.visible`
 * overrides before FP floor-band visibility owns shell meshes again.
 */
export function restoreUnitInteriorMeshVisibilityAfterAuthView(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.userData.mammothUnitInterior === true) {
      obj.visible = true;
    }
  });
}

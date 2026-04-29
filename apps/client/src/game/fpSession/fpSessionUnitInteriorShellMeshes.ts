import * as THREE from "three";

/**
 * Collect meshes tagged `mammothUnitInterior` for FP exterior fill-rate toggles.
 *
 * Run **after** elevator and apartment-door mounts so the hide set also picks up `fp_elevator:*` cab
 * / landing / hail geometry and swing-door meshes (see `fpElevatorShaftVisual.ts`). Traversing
 * before those mounts leaves interior shaft/door meshes visible from the street.
 */
export function collectFpSessionUnitInteriorShellMeshes(
  buildingRoot: THREE.Object3D,
): THREE.Mesh[] {
  let topPlateLevel = -Infinity;
  for (const ch of buildingRoot.children) {
    const li = ch.userData.mammothPlateLevelIndex;
    if (typeof li === "number" && li > topPlateLevel) topPlateLevel = li;
  }
  const unitInteriorMeshes: THREE.Mesh[] = [];
  buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothUnitInterior !== true) return;
    if (obj.name.startsWith("shell_ceiling")) {
      let ancestor: THREE.Object3D | null = obj;
      while (ancestor && ancestor.parent !== buildingRoot) ancestor = ancestor.parent;
      const ancestorLevel = ancestor?.userData.mammothPlateLevelIndex;
      if (typeof ancestorLevel === "number" && ancestorLevel === topPlateLevel) return;
    }
    unitInteriorMeshes.push(obj);
  });
  return unitInteriorMeshes;
}

/** Removes meshes spawned under apartment wardrobe / footlocker props — called before furniture rebuild refreshes. */
export function stripApartmentFurnitureInteriorMeshes(unitInteriorMeshes: THREE.Mesh[]): void {
  let w = 0;
  outer: for (let i = 0; i < unitInteriorMeshes.length; i++) {
    const m = unitInteriorMeshes[i]!;
    for (let cur: THREE.Object3D | null = m; cur; cur = cur.parent) {
      if (cur.userData.mammothApartmentFurnitureProp === true) continue outer;
    }
    unitInteriorMeshes[w++] = m;
  }
  unitInteriorMeshes.length = w;
}

/** Meshes under wardrobe / footlocker clones (`mammothApartmentFurnitureProp`). Idempotent per rebuild when paired with strip. */
export function appendApartmentFurnitureInteriorMeshes(
  buildingRoot: THREE.Object3D,
  unitInteriorMeshes: THREE.Mesh[],
): void {
  buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothUnitInterior !== true) return;
    for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
      if (cur.userData.mammothApartmentFurnitureProp === true) {
        unitInteriorMeshes.push(obj);
        return;
      }
    }
  });
}

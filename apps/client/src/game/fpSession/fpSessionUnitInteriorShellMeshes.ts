import * as THREE from "three";

export type FpResidentialUnitShellMesh = {
  mesh: THREE.Mesh;
  unitId: string;
};

export type FpSessionUnitInteriorMeshEntry = {
  mesh: THREE.Mesh;
  residentialUnitId: string | null;
  apartmentUnitKey: string | null;
  residentialExteriorGlass: boolean;
};

function residentialUnitIdFromPlacedObjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.startsWith("unit_") ? value : null;
}

function resolveUnitInteriorMeshEntry(
  mesh: THREE.Mesh,
  buildingRoot: THREE.Object3D,
): FpSessionUnitInteriorMeshEntry {
  let residentialUnitId: string | null = null;
  let apartmentUnitKey: string | null = null;
  let residentialExteriorGlass = false;
  for (let cur: THREE.Object3D | null = mesh; cur; cur = cur.parent) {
    if (residentialUnitId === null) {
      residentialUnitId = residentialUnitIdFromPlacedObjectId(cur.userData.mammothPlacedObjectId);
    }
    if (apartmentUnitKey === null) {
      const unitKey = cur.userData.mammothApartmentUnitKey;
      if (typeof unitKey === "string" && unitKey.length > 0) {
        apartmentUnitKey = unitKey;
      }
    }
    if (cur.userData.mammothResidentialUnitExteriorGlass === true) {
      residentialExteriorGlass = true;
    }
    if (
      cur === buildingRoot ||
      (residentialUnitId !== null && apartmentUnitKey !== null && residentialExteriorGlass)
    ) {
      break;
    }
  }
  return { mesh, residentialUnitId, apartmentUnitKey, residentialExteriorGlass };
}

/**
 * Collect meshes tagged `mammothUnitInterior` for FP exterior fill-rate toggles.
 *
 * Run **after** elevator and apartment-door mounts so the hide set also picks up `fp_elevator:*` cab
 * / landing / hail geometry and swing-door meshes (see `fpElevatorShaftVisual.ts`). Traversing
 * before those mounts leaves interior shaft/door meshes visible from the street.
 */
export function collectFpSessionUnitInteriorMeshEntries(
  buildingRoot: THREE.Object3D,
): FpSessionUnitInteriorMeshEntry[] {
  let topPlateLevel = -Infinity;
  for (const ch of buildingRoot.children) {
    const li = ch.userData.mammothPlateLevelIndex;
    if (typeof li === "number" && li > topPlateLevel) topPlateLevel = li;
  }
  const unitInteriorMeshes: FpSessionUnitInteriorMeshEntry[] = [];
  buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothUnitInterior !== true) return;
    if (obj.name.startsWith("shell_ceiling")) {
      let ancestor: THREE.Object3D | null = obj;
      while (ancestor && ancestor.parent !== buildingRoot) ancestor = ancestor.parent;
      const ancestorLevel = ancestor?.userData.mammothPlateLevelIndex;
      if (typeof ancestorLevel === "number" && ancestorLevel === topPlateLevel) return;
    }
    unitInteriorMeshes.push(resolveUnitInteriorMeshEntry(obj, buildingRoot));
  });
  return unitInteriorMeshes;
}

export function collectFpSessionUnitInteriorShellMeshes(
  buildingRoot: THREE.Object3D,
): THREE.Mesh[] {
  return collectFpSessionUnitInteriorMeshEntries(buildingRoot).map((entry) => entry.mesh);
}

/**
 * Top-floor residential unit shells are mostly occluded by partition walls when the player is inside
 * one apartment, but the roof/ceiling path keeps them live for exterior silhouette correctness.
 * Collect them separately so FP can keep only the current unit's shell visible in that specific case.
 */
export function collectFpSessionTopFloorResidentialUnitShellMeshes(
  buildingRoot: THREE.Object3D,
): FpResidentialUnitShellMesh[] {
  let topPlateLevel = -Infinity;
  for (const ch of buildingRoot.children) {
    const li = ch.userData.mammothPlateLevelIndex;
    if (typeof li === "number" && li > topPlateLevel) topPlateLevel = li;
  }
  const meshes: FpResidentialUnitShellMesh[] = [];
  buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const placedObjectId = obj.userData.mammothPlacedObjectId;
    if (
      typeof placedObjectId !== "string" ||
      !placedObjectId.startsWith("unit_")
    ) {
      return;
    }
    let ancestor: THREE.Object3D | null = obj;
    while (ancestor && ancestor.parent !== buildingRoot) ancestor = ancestor.parent;
    const ancestorLevel = ancestor?.userData.mammothPlateLevelIndex;
    if (typeof ancestorLevel !== "number" || ancestorLevel !== topPlateLevel) return;
    meshes.push({ mesh: obj, unitId: placedObjectId });
  });
  return meshes;
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

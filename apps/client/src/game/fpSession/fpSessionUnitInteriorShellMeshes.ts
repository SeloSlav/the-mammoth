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
  genericInteriorVisibleInResidentialUnit: boolean;
  /** Per-floor instanced swing doors (`fpApartmentDoors`) — corridor-facing, not unit-owned shell. */
  apartmentSwingDoor: boolean;
  /** Hollow plaster shell (`shell_wall_*`, floors/ceilings) — occludes exterior cladding through glass. */
  isResidentialShellPlaster: boolean;
  /** Owning floor plate level when this tagged mesh lives under a plate segment. */
  plateLevelIndex: number | null;
};

/** Plaster hollow shell pieces for a `unit_*` placed object (not exterior cladding or glass). */
export function isResidentialUnitShellPlasterMesh(mesh: THREE.Mesh): boolean {
  if (mesh.name.startsWith("shell_exterior_cladding")) return false;
  return (
    mesh.name.startsWith("shell_wall_") ||
    mesh.name.startsWith("shell_floor") ||
    mesh.name.startsWith("shell_ceiling") ||
    mesh.name.startsWith("balcony_shell_") ||
    mesh.name.startsWith("balcony_wall_")
  );
}

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
  let genericInteriorVisibleInResidentialUnit = false;
  let apartmentSwingDoor = false;
  let plateLevelIndex: number | null = null;
  for (let cur: THREE.Object3D | null = mesh; cur; cur = cur.parent) {
    if (plateLevelIndex === null && typeof cur.userData.mammothPlateLevelIndex === "number") {
      plateLevelIndex = cur.userData.mammothPlateLevelIndex;
    }
    if (cur.userData.mammothApartmentSwingDoor === true) {
      apartmentSwingDoor = true;
    }
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
    if (cur.userData.mammothGenericInteriorVisibleInResidentialUnit === true) {
      genericInteriorVisibleInResidentialUnit = true;
    }
    if (
      cur === buildingRoot ||
      (residentialUnitId !== null &&
        apartmentUnitKey !== null &&
        residentialExteriorGlass &&
        genericInteriorVisibleInResidentialUnit)
    ) {
      break;
    }
  }
  return {
    mesh,
    residentialUnitId,
    apartmentUnitKey,
    residentialExteriorGlass,
    genericInteriorVisibleInResidentialUnit,
    apartmentSwingDoor,
    isResidentialShellPlaster: isResidentialUnitShellPlasterMesh(mesh),
    plateLevelIndex,
  };
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


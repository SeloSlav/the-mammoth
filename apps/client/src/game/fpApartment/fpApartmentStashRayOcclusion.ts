import * as THREE from "three";
import { MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER } from "@the-mammoth/engine";
import { MAMMOTH_FP_INTERIOR_PARTITION_SOLID } from "@the-mammoth/world";

export const STASH_RAY_OCCLUSION_EPSILON_M = 0.03;

const _cameraWorldScratch = new THREE.Vector3();
const _targetScratch = new THREE.Vector3();
const _rayDirScratch = new THREE.Vector3();
const _occlusionRaycaster = new THREE.Raycaster();

function configureStashOcclusionRaycaster(): void {
  _occlusionRaycaster.layers.disableAll();
  _occlusionRaycaster.layers.enable(0);
  _occlusionRaycaster.layers.enable(MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER);
}

function meshVisibleInHierarchy(mesh: THREE.Mesh): boolean {
  for (let cur: THREE.Object3D | null = mesh; cur; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

/** Architectural solids that should block stash / grow-tray line-of-sight — not picks or props. */
export function isApartmentStashRayOccluderMesh(mesh: THREE.Mesh): boolean {
  if (mesh.userData.mammothApartmentStashKey !== undefined) return false;
  if (mesh.userData.mammothGrowTrayId !== undefined) return false;
  if (mesh.userData.mammothGrowPlantPick === true) return false;
  if (mesh.userData.mammothApartmentWardrobePickUnitKey !== undefined) return false;
  if (mesh.userData.mammothApartmentSittableKey !== undefined) return false;
  if (mesh.userData.mammothResidentialUnitExteriorGlass === true) return false;
  if (mesh.userData.mammothCabMirror === true) return false;
  if (mesh.userData.mammothApartmentDecorProp === true) return false;

  if (mesh.userData[MAMMOTH_FP_INTERIOR_PARTITION_SOLID] === true) return true;
  if (mesh.userData.mammothUnitInterior === true) return true;
  return false;
}

export type FpApartmentStashRayOcclusion = {
  rebuildFromBuildingRoot: (buildingRoot: THREE.Object3D) => void;
  nearestOccluderDistanceAlongViewRay: (
    camera: THREE.PerspectiveCamera,
    maxDistance: number,
    apartmentUnitKey?: string,
  ) => number | null;
  targetOccludedFromCamera: (
    camera: THREE.PerspectiveCamera,
    targetWorld: THREE.Vector3,
    apartmentUnitKey?: string,
  ) => boolean;
  hitOccluded: (hit: THREE.Intersection, nearestOccluderDistance: number | null) => boolean;
};

function stringUserDataInAncestors(obj: THREE.Object3D, key: string): string | null {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    const value = cur.userData[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function numberUserDataInAncestors(obj: THREE.Object3D, key: string): number | null {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    const value = cur.userData[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function booleanUserDataInAncestors(obj: THREE.Object3D, key: string): boolean {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    if (cur.userData[key] === true) return true;
  }
  return false;
}

function apartmentLevelUnitIdKey(level: number, unitId: string): string {
  return `${level}|${unitId}`;
}

function levelUnitIdFromApartmentUnitKey(unitKey: string): string | null {
  const parts = unitKey.split("|");
  const level = Number(parts[1]);
  const unitId = parts[2];
  return Number.isFinite(level) && typeof unitId === "string" && unitId.length > 0
    ? apartmentLevelUnitIdKey(Math.trunc(level), unitId)
    : null;
}

function pushMappedMesh(
  map: Map<string | number, THREE.Mesh[]>,
  key: string | number,
  mesh: THREE.Mesh,
): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(mesh);
  } else {
    map.set(key, [mesh]);
  }
}

export function createFpApartmentStashRayOcclusion(): FpApartmentStashRayOcclusion {
  const occluderMeshes: THREE.Mesh[] = [];
  const occluderMeshesByUnitKey = new Map<string, THREE.Mesh[]>();
  const occluderMeshesByLevelUnitId = new Map<string, THREE.Mesh[]>();
  const floorSharedOccluderMeshesByLevel = new Map<number, THREE.Mesh[]>();
  const scopedOccluderScratch: THREE.Mesh[] = [];
  const visibleOccluderScratch: THREE.Mesh[] = [];

  const appendMappedMeshes = (
    map: ReadonlyMap<string | number, readonly THREE.Mesh[]>,
    key: string | number | null,
  ): void => {
    if (key === null) return;
    const meshes = map.get(key);
    if (meshes) scopedOccluderScratch.push(...meshes);
  };

  const collectVisibleOccluders = (apartmentUnitKey?: string): THREE.Mesh[] => {
    let candidates = occluderMeshes;
    if (apartmentUnitKey) {
      scopedOccluderScratch.length = 0;
      appendMappedMeshes(occluderMeshesByUnitKey, apartmentUnitKey);
      appendMappedMeshes(
        occluderMeshesByLevelUnitId,
        levelUnitIdFromApartmentUnitKey(apartmentUnitKey),
      );
      const level = Number(apartmentUnitKey.split("|")[1]);
      appendMappedMeshes(
        floorSharedOccluderMeshesByLevel,
        Number.isFinite(level) ? Math.trunc(level) : null,
      );
      if (scopedOccluderScratch.length > 0) candidates = scopedOccluderScratch;
    }

    visibleOccluderScratch.length = 0;
    for (let i = 0; i < candidates.length; i++) {
      const mesh = candidates[i]!;
      if (meshVisibleInHierarchy(mesh)) visibleOccluderScratch.push(mesh);
    }
    return visibleOccluderScratch;
  };

  const nearestOccluderAlongRay = (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    apartmentUnitKey?: string,
  ): number | null => {
    const visible = collectVisibleOccluders(apartmentUnitKey);
    if (visible.length === 0) return null;
    configureStashOcclusionRaycaster();
    _occlusionRaycaster.set(origin, direction);
    _occlusionRaycaster.far = maxDistance;
    return _occlusionRaycaster.intersectObjects(visible, false)[0]?.distance ?? null;
  };

  return {
    rebuildFromBuildingRoot(buildingRoot) {
      occluderMeshes.length = 0;
      occluderMeshesByUnitKey.clear();
      occluderMeshesByLevelUnitId.clear();
      floorSharedOccluderMeshesByLevel.clear();
      buildingRoot.updateMatrixWorld(true);
      buildingRoot.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || !isApartmentStashRayOccluderMesh(obj)) return;
        occluderMeshes.push(obj);

        const unitKey = stringUserDataInAncestors(obj, "mammothApartmentUnitKey");
        if (unitKey !== null) {
          pushMappedMesh(occluderMeshesByUnitKey, unitKey, obj);
          return;
        }

        const level = numberUserDataInAncestors(obj, "mammothPlateLevelIndex");
        const placedObjectId = stringUserDataInAncestors(obj, "mammothPlacedObjectId");
        if (level !== null && placedObjectId?.startsWith("unit_")) {
          pushMappedMesh(
            occluderMeshesByLevelUnitId,
            apartmentLevelUnitIdKey(Math.trunc(level), placedObjectId),
            obj,
          );
          return;
        }

        if (level !== null && booleanUserDataInAncestors(obj, "mammothApartmentSwingDoor")) {
          pushMappedMesh(floorSharedOccluderMeshesByLevel, Math.trunc(level), obj);
        }
      });
    },
    nearestOccluderDistanceAlongViewRay(camera, maxDistance, apartmentUnitKey) {
      if (maxDistance <= STASH_RAY_OCCLUSION_EPSILON_M) return null;
      camera.getWorldPosition(_cameraWorldScratch);
      camera.getWorldDirection(_rayDirScratch);
      return nearestOccluderAlongRay(
        _cameraWorldScratch,
        _rayDirScratch,
        maxDistance,
        apartmentUnitKey,
      );
    },
    targetOccludedFromCamera(camera, targetWorld, apartmentUnitKey) {
      camera.getWorldPosition(_cameraWorldScratch);
      const distToTarget = _cameraWorldScratch.distanceTo(targetWorld);
      if (distToTarget <= STASH_RAY_OCCLUSION_EPSILON_M) return false;
      _targetScratch.copy(targetWorld).sub(_cameraWorldScratch);
      _rayDirScratch.copy(_targetScratch).multiplyScalar(1 / distToTarget);
      const occluderDist = nearestOccluderAlongRay(
        _cameraWorldScratch,
        _rayDirScratch,
        distToTarget - STASH_RAY_OCCLUSION_EPSILON_M,
        apartmentUnitKey,
      );
      return occluderDist !== null;
    },
    hitOccluded(hit, nearestOccluderDistance) {
      return (
        nearestOccluderDistance !== null &&
        nearestOccluderDistance < hit.distance - STASH_RAY_OCCLUSION_EPSILON_M
      );
    },
  };
}

export function maxRaycastHitDistance(hits: readonly THREE.Intersection[]): number {
  let maxDistance = 0;
  for (const hit of hits) maxDistance = Math.max(maxDistance, hit.distance);
  return maxDistance;
}

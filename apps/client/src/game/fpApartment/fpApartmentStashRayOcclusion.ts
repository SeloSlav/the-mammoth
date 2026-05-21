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
  ) => number | null;
  targetOccludedFromCamera: (
    camera: THREE.PerspectiveCamera,
    targetWorld: THREE.Vector3,
  ) => boolean;
  hitOccluded: (hit: THREE.Intersection, nearestOccluderDistance: number | null) => boolean;
};

export function createFpApartmentStashRayOcclusion(): FpApartmentStashRayOcclusion {
  const occluderMeshes: THREE.Mesh[] = [];
  const visibleOccluderScratch: THREE.Mesh[] = [];

  const collectVisibleOccluders = (): readonly THREE.Mesh[] => {
    visibleOccluderScratch.length = 0;
    for (let i = 0; i < occluderMeshes.length; i++) {
      const mesh = occluderMeshes[i]!;
      if (meshVisibleInHierarchy(mesh)) visibleOccluderScratch.push(mesh);
    }
    return visibleOccluderScratch;
  };

  const nearestOccluderAlongRay = (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
  ): number | null => {
    const visible = collectVisibleOccluders();
    if (visible.length === 0) return null;
    configureStashOcclusionRaycaster();
    _occlusionRaycaster.set(origin, direction);
    _occlusionRaycaster.far = maxDistance;
    return _occlusionRaycaster.intersectObjects([...visible], false)[0]?.distance ?? null;
  };

  return {
    rebuildFromBuildingRoot(buildingRoot) {
      occluderMeshes.length = 0;
      buildingRoot.updateMatrixWorld(true);
      buildingRoot.traverse((obj) => {
        if (obj instanceof THREE.Mesh && isApartmentStashRayOccluderMesh(obj)) {
          occluderMeshes.push(obj);
        }
      });
    },
    nearestOccluderDistanceAlongViewRay(camera, maxDistance) {
      if (maxDistance <= STASH_RAY_OCCLUSION_EPSILON_M) return null;
      camera.getWorldPosition(_cameraWorldScratch);
      camera.getWorldDirection(_rayDirScratch);
      return nearestOccluderAlongRay(_cameraWorldScratch, _rayDirScratch, maxDistance);
    },
    targetOccludedFromCamera(camera, targetWorld) {
      camera.getWorldPosition(_cameraWorldScratch);
      const distToTarget = _cameraWorldScratch.distanceTo(targetWorld);
      if (distToTarget <= STASH_RAY_OCCLUSION_EPSILON_M) return false;
      _targetScratch.copy(targetWorld).sub(_cameraWorldScratch);
      _rayDirScratch.copy(_targetScratch).multiplyScalar(1 / distToTarget);
      const occluderDist = nearestOccluderAlongRay(
        _cameraWorldScratch,
        _rayDirScratch,
        distToTarget - STASH_RAY_OCCLUSION_EPSILON_M,
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

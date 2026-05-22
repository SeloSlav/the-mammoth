import * as THREE from "three";
import type { MountFpApartmentDecorMeshesResult } from "../fpApartment/fpApartmentDecorMeshes.js";
import { balconyGrowTraySoilAimPoint } from "../fpPlacement/fpPlacementSnap.js";
import { readGrowTraySoilLocalY } from "./fpBalconyGrowStageVisual.js";

const _aimScratch = new THREE.Vector3();

/**
 * Center-screen grow-tray raycast → soil-plane intersection (world XZ).
 * Must match server tray positions — never use a fixed y=0 horizontal plane.
 */
export function resolveBalconyWaterPourAimXz(
  camera: THREE.PerspectiveCamera,
  decor: MountFpApartmentDecorMeshesResult,
  feet: THREE.Vector3,
  out: { x: number; z: number },
): boolean {
  const hits = decor.raycastBalconyGrowTrayHits(feet, camera);
  if (hits.length === 0) return false;

  const hit = hits[0]!;
  const trayRoot = hit.object.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
  if (trayRoot) {
    trayRoot.updateMatrixWorld(true);
    const soilY = readGrowTraySoilLocalY(trayRoot);
    if (balconyGrowTraySoilAimPoint(camera, trayRoot.matrixWorld, soilY, _aimScratch)) {
      out.x = _aimScratch.x;
      out.z = _aimScratch.z;
      return true;
    }
  }

  out.x = hit.point.x;
  out.z = hit.point.z;
  return true;
}

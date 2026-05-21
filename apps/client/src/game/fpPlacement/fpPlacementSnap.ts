import * as THREE from "three";
import {
  BALCONY_GROW_SLOTS_PER_TRAY,
  BALCONY_GROW_SLOT_LOCAL_OFFSETS,
  BALCONY_GROW_SOIL_LOCAL_Y,
  balconyGrowSlotLocalPosition,
  type BalconyGrowSlotXZ,
} from "@the-mammoth/schemas";

export type TraySnapResult = {
  slotIndex: number;
  worldPosition: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
};

const _screenCenterNdc = new THREE.Vector2(0, 0);
const _trayOriginScratch = new THREE.Vector3();
const _soilPlaneScratch = new THREE.Plane();
const _soilRaycaster = new THREE.Raycaster();
const _up = new THREE.Vector3(0, 1, 0);

/** Center-screen ray intersected with the tray soil plane — stable for short floor props. */
export function balconyGrowTraySoilAimPoint(
  camera: THREE.PerspectiveCamera,
  trayWorldMatrix: THREE.Matrix4,
  soilLocalY: number,
  out: THREE.Vector3,
): boolean {
  _trayOriginScratch.set(0, soilLocalY, 0).applyMatrix4(trayWorldMatrix);
  _soilPlaneScratch.setFromNormalAndCoplanarPoint(_up, _trayOriginScratch);
  _soilRaycaster.setFromCamera(_screenCenterNdc, camera);
  return _soilRaycaster.ray.intersectPlane(_soilPlaneScratch, out) !== null;
}

/**
 * Nearest of four tray-local snap offsets → world position for placement preview / plant.
 */
export function nearestBalconyGrowTraySlot(
  trayWorldMatrix: THREE.Matrix4,
  aimWorldPoint: THREE.Vector3,
  soilLocalY = BALCONY_GROW_SOIL_LOCAL_Y,
  slotOffsets: readonly BalconyGrowSlotXZ[] = BALCONY_GROW_SLOT_LOCAL_OFFSETS,
): TraySnapResult | null {
  if (BALCONY_GROW_SLOTS_PER_TRAY <= 0) return null;
  const inv = new THREE.Matrix4().copy(trayWorldMatrix).invert();
  const localAim = aimWorldPoint.clone().applyMatrix4(inv);
  let bestIdx = 0;
  let bestDistSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < BALCONY_GROW_SLOTS_PER_TRAY; i++) {
    const off = slotOffsets[i];
    if (!off) continue;
    const dx = localAim.x - off.x;
    const dz = localAim.z - off.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = i;
    }
  }
  const local = balconyGrowSlotLocalPosition(bestIdx, soilLocalY, slotOffsets);
  const worldPosition = new THREE.Vector3(local.x, local.y, local.z).applyMatrix4(trayWorldMatrix);
  const worldQuaternion = new THREE.Quaternion().setFromRotationMatrix(trayWorldMatrix);
  return { slotIndex: bestIdx, worldPosition, worldQuaternion };
}

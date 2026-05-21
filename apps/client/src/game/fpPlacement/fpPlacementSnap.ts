import * as THREE from "three";
import { BALCONY_GROW_SLOT_LOCAL_OFFSETS, BALCONY_GROW_SLOTS_PER_TRAY } from "@the-mammoth/schemas";

export type TraySnapResult = {
  slotIndex: number;
  worldPosition: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
};

/**
 * Nearest of four tray-local snap offsets → world position for placement preview / plant.
 */
export function nearestBalconyGrowTraySlot(
  trayWorldMatrix: THREE.Matrix4,
  aimWorldPoint: THREE.Vector3,
): TraySnapResult | null {
  if (BALCONY_GROW_SLOTS_PER_TRAY <= 0) return null;
  const inv = new THREE.Matrix4().copy(trayWorldMatrix).invert();
  const localAim = aimWorldPoint.clone().applyMatrix4(inv);
  let bestIdx = 0;
  let bestDistSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < BALCONY_GROW_SLOTS_PER_TRAY; i++) {
    const off = BALCONY_GROW_SLOT_LOCAL_OFFSETS[i];
    if (!off) continue;
    const dx = localAim.x - off.x;
    const dz = localAim.z - off.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = i;
    }
  }
  const off = BALCONY_GROW_SLOT_LOCAL_OFFSETS[bestIdx];
  if (!off) return null;
  const localPos = new THREE.Vector3(off.x, 0.02, off.z);
  const worldPosition = localPos.applyMatrix4(trayWorldMatrix);
  const worldQuaternion = new THREE.Quaternion().setFromRotationMatrix(trayWorldMatrix);
  return { slotIndex: bestIdx, worldPosition, worldQuaternion };
}

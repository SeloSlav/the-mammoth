import * as THREE from "three";
import { BALCONY_GROW_TRAY_PRESENTATION_RADIUS_M } from "@the-mammoth/schemas";

const _trayWorldScratch = new THREE.Vector3();
const _presentationRadiusSq =
  BALCONY_GROW_TRAY_PRESENTATION_RADIUS_M * BALCONY_GROW_TRAY_PRESENTATION_RADIUS_M;

/**
 * Balcony grow trays sit outside the strict in-unit visibility hull. Force the decor group visible
 * while the player is on the balcony so plants, picks, and inspect overlays work.
 */
export function syncBalconyGrowTrayDecorVisibility(
  feet: { x: number; y: number; z: number },
  unitKey: string | null,
  slotVisualsByTrayId: ReadonlyMap<string, THREE.Group>,
): void {
  if (!unitKey) return;

  for (const slotGroup of slotVisualsByTrayId.values()) {
    const decorGroup = slotGroup.parent;
    if (!(decorGroup instanceof THREE.Object3D)) continue;
    if (decorGroup.userData.mammothApartmentUnitKey !== unitKey) continue;

    decorGroup.getWorldPosition(_trayWorldScratch);
    const dx = feet.x - _trayWorldScratch.x;
    const dz = feet.z - _trayWorldScratch.z;
    if (dx * dx + dz * dz > _presentationRadiusSq) continue;

    decorGroup.visible = true;
    slotGroup.visible = true;
  }
}

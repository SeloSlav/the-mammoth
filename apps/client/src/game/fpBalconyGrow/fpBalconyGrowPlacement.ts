import * as THREE from "three";
import type { DbConnection } from "../../module_bindings";
import { balconyGrowStageGlb } from "@the-mammoth/assets";
import { getMammothItemDef, mammothItemDefIsPlantableSeed } from "../../inventory/mammothItemCatalog";
import type { Identity } from "spacetimedb";
import { getFpHotbarSelectedSlot } from "../fpHotbar/fpHotbarSelection.js";
import { getHotbarSlotInventoryItem } from "../fpHotbar/fpHotbarResolve.js";
import { nearestBalconyGrowTraySlot } from "../fpPlacement/fpPlacementSnap.js";
import type { FpWorldPlacementPreview } from "../fpPlacement/fpWorldPlacementPreview.js";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";

export type BalconyGrowPlacementRaycast = {
  unitKey: string;
  trayId: string;
  trayObject: THREE.Object3D;
  slotIndex: number;
  seedDefId: string;
  valid: boolean;
};

const PHASE_EMPTY = 0;

export function resolveBalconyGrowPlacementFromRay(
  conn: DbConnection,
  identity: Identity | undefined,
  hits: THREE.Intersection[],
  growState: BalconyGrowOpUnitState,
): BalconyGrowPlacementRaycast | null {
  if (!identity || !conn.identity) return null;
  const slot = getFpHotbarSelectedSlot();
  if (slot === null) return null;
  const hotbarItem = getHotbarSlotInventoryItem(conn, identity, slot);
  if (!hotbarItem) return null;
  const def = getMammothItemDef(hotbarItem.defId);
  if (!mammothItemDefIsPlantableSeed(def)) return null;

  for (const hit of hits) {
    const trayId = hit.object.userData.mammothGrowTrayId;
    const unitKey = hit.object.userData.mammothGrowTrayUnitKey;
    if (typeof trayId !== "string" || typeof unitKey !== "string") continue;
    const trayRoot = hit.object.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
    if (!trayRoot) continue;
    trayRoot.updateMatrixWorld(true);
    const snap = nearestBalconyGrowTraySlot(trayRoot.matrixWorld, hit.point);
    if (!snap) continue;
    const occupied = growState.plants.some(
      (p) =>
        p.trayId === trayId &&
        p.slotIndex === snap.slotIndex &&
        p.phase !== PHASE_EMPTY,
    );
    return {
      unitKey,
      trayId,
      trayObject: trayRoot,
      slotIndex: snap.slotIndex,
      seedDefId: hotbarItem.defId,
      valid: !occupied,
    };
  }
  return null;
}

export function syncBalconyGrowPlacementPreview(
  preview: FpWorldPlacementPreview | null,
  placement: BalconyGrowPlacementRaycast | null,
): void {
  if (!preview) return;
  if (!placement) {
    preview.setVisible(false);
    preview.update(null, false);
    return;
  }
  placement.trayObject.updateMatrixWorld(true);
  const snap = nearestBalconyGrowTraySlot(
    placement.trayObject.matrixWorld,
    new THREE.Vector3(),
  );
  const def = getMammothItemDef(placement.seedDefId);
  const scale = def?.balconyGrow?.stageScale ?? 0.6;
  const m = placement.trayObject.matrixWorld;
  const off = new THREE.Vector3();
  const offsets = [
    { x: -0.11, z: -0.11 },
    { x: 0.11, z: -0.11 },
    { x: -0.11, z: 0.11 },
    { x: 0.11, z: 0.11 },
  ];
  const slotOff = offsets[placement.slotIndex];
  if (slotOff) {
    off.set(slotOff.x, 0.02, slotOff.z).applyMatrix4(m);
  }
  preview.update(
    {
      worldPosition: off,
      worldQuaternion: new THREE.Quaternion().setFromRotationMatrix(m),
      scale: scale * 0.5,
    },
    placement.valid,
  );
}

export function balconyGrowSeedPreviewGlbUrl(): string {
  return balconyGrowStageGlb("seed");
}

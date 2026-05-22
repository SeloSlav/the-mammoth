import * as THREE from "three";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import {
  balconyGrowTraySoilAimPoint,
  nearestBalconyGrowTraySlot,
} from "../fpPlacement/fpPlacementSnap.js";
import {
  readGrowTraySoilLocalY,
  readGrowTraySlotLocalOffsets,
} from "./fpBalconyGrowStageVisual.js";

const PHASE_EMPTY = 0;
const _soilAimScratch = new THREE.Vector3();

/** Center-screen ray ∩ tray soil plane → nearest slot index. */
export function resolveBalconyGrowSoilAimedSlotIndex(
  camera: THREE.PerspectiveCamera,
  trayRoot: THREE.Object3D,
): number | null {
  trayRoot.updateMatrixWorld(true);
  const soilY = readGrowTraySoilLocalY(trayRoot);
  if (!balconyGrowTraySoilAimPoint(camera, trayRoot.matrixWorld, soilY, _soilAimScratch)) {
    return null;
  }
  const snap = nearestBalconyGrowTraySlot(
    trayRoot.matrixWorld,
    _soilAimScratch,
    soilY,
    readGrowTraySlotLocalOffsets(trayRoot),
  );
  return snap?.slotIndex ?? null;
}

export function balconyGrowLivePlantInSlot(
  growState: BalconyGrowOpUnitState,
  trayId: string,
  slotIndex: number,
): boolean {
  const slot = Number(slotIndex);
  return growState.plants.some(
    (p) =>
      p.trayId === trayId &&
      Number(p.slotIndex) === slot &&
      Number(p.phase) !== PHASE_EMPTY,
  );
}

/** True when the aimed slot on this grow-tray pick volume has a live plant. */
export function growTrayRayHitTargetsLivePlant(
  hit: THREE.Intersection | { object: THREE.Object3D },
  growState: BalconyGrowOpUnitState,
  camera: THREE.PerspectiveCamera,
): boolean {
  const trayId = hit.object.userData.mammothGrowTrayId;
  if (typeof trayId !== "string") return false;

  const explicitSlot = hit.object.userData.mammothGrowSlotIndex;
  if (typeof explicitSlot === "number") {
    return balconyGrowLivePlantInSlot(growState, trayId, explicitSlot);
  }

  const trayRoot = hit.object.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
  if (!trayRoot) return false;

  const aimedSlot = resolveBalconyGrowSoilAimedSlotIndex(camera, trayRoot);
  if (aimedSlot === null) return false;
  return balconyGrowLivePlantInSlot(growState, trayId, aimedSlot);
}

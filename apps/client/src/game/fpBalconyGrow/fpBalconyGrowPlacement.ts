import * as THREE from "three";
import type { DbConnection } from "../../module_bindings";
import { BALCONY_GROW_TRAY_INTERACT_RADIUS_M, balconyGrowStageVisualScale } from "@the-mammoth/schemas";
import { getMammothItemDef, mammothItemDefIsPlantableSeed } from "../../inventory/mammothItemCatalog";
import type { Identity } from "spacetimedb";
import { getFpHotbarSelectedSlot } from "../fpHotbar/fpHotbarSelection.js";
import { getHotbarSlotInventoryItem } from "../fpHotbar/fpHotbarResolve.js";
import {
  balconyGrowTraySoilAimPoint,
  nearestBalconyGrowTraySlot,
} from "../fpPlacement/fpPlacementSnap.js";
import type { FpWorldPlacementPreview } from "../fpPlacement/fpWorldPlacementPreview.js";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import { clientOwnsClaimedApartmentUnit } from "../fpApartment/fpApartmentGameplay.js";
import { readGrowTraySoilLocalY, readGrowTraySlotLocalOffsets, balconyGrowSlotWorldPosition } from "./fpBalconyGrowStageVisual.js";

export type BalconyGrowPlacementRaycast = {
  unitKey: string;
  trayId: string;
  trayObject: THREE.Object3D;
  slotIndex: number;
  seedDefId: string;
  valid: boolean;
};

const PHASE_EMPTY = 0;
const _camPosScratch = new THREE.Vector3();
const _camDirScratch = new THREE.Vector3();
const _toTrayScratch = new THREE.Vector3();
const _trayCenterScratch = new THREE.Vector3();
const _soilAimScratch = new THREE.Vector3();

type SeedHotbarContext = {
  seedDefId: string;
};

function readSeedHotbarContext(
  conn: DbConnection,
  identity: Identity | undefined,
): SeedHotbarContext | null {
  if (!identity || !conn.identity) return null;
  const slot = getFpHotbarSelectedSlot();
  if (slot === null) return null;
  const hotbarItem = getHotbarSlotInventoryItem(conn, identity, slot);
  if (!hotbarItem) return null;
  const def = getMammothItemDef(hotbarItem.defId);
  if (!mammothItemDefIsPlantableSeed(def)) return null;
  return { seedDefId: hotbarItem.defId };
}

function slotOccupied(
  growState: BalconyGrowOpUnitState,
  trayId: string,
  slotIndex: number,
): boolean {
  return growState.plants.some(
    (p) => p.trayId === trayId && p.slotIndex === slotIndex && p.phase !== PHASE_EMPTY,
  );
}

const _previewPosScratch = new THREE.Vector3();

function placementForTray(
  camera: THREE.PerspectiveCamera,
  unitKey: string,
  trayId: string,
  trayRoot: THREE.Object3D,
  growState: BalconyGrowOpUnitState,
  seedCtx: SeedHotbarContext,
): BalconyGrowPlacementRaycast | null {
  trayRoot.updateMatrixWorld(true);
  const soilLocalY = readGrowTraySoilLocalY(trayRoot);
  if (!balconyGrowTraySoilAimPoint(camera, trayRoot.matrixWorld, soilLocalY, _soilAimScratch)) {
    return null;
  }
  const snap = nearestBalconyGrowTraySlot(
    trayRoot.matrixWorld,
    _soilAimScratch,
    soilLocalY,
    readGrowTraySlotLocalOffsets(trayRoot),
  );
  if (!snap) return null;
  const occupied = slotOccupied(growState, trayId, snap.slotIndex);
  return {
    unitKey,
    trayId,
    trayObject: trayRoot,
    slotIndex: snap.slotIndex,
    seedDefId: seedCtx.seedDefId,
    valid: !occupied,
  };
}

function placementFromTrayHit(
  camera: THREE.PerspectiveCamera,
  hit: THREE.Intersection,
  growState: BalconyGrowOpUnitState,
  seedCtx: SeedHotbarContext,
): BalconyGrowPlacementRaycast | null {
  const trayId = hit.object.userData.mammothGrowTrayId;
  const unitKey = hit.object.userData.mammothGrowTrayUnitKey;
  if (typeof trayId !== "string" || typeof unitKey !== "string") return null;
  const trayRoot = hit.object.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
  if (!trayRoot) return null;
  return placementForTray(camera, unitKey, trayId, trayRoot, growState, seedCtx);
}

function pickAimedGrowTrayMesh(
  conn: DbConnection,
  identity: Identity,
  feet: { x: number; y: number; z: number },
  camera: THREE.PerspectiveCamera,
  trayPickMeshes: readonly THREE.Mesh[],
  slotPickMeshes: readonly THREE.Mesh[],
): THREE.Mesh | null {
  camera.getWorldPosition(_camPosScratch);
  camera.getWorldDirection(_camDirScratch);

  const radiusSq =
    BALCONY_GROW_TRAY_INTERACT_RADIUS_M * BALCONY_GROW_TRAY_INTERACT_RADIUS_M;
  let bestScore = -Infinity;
  let bestMesh: THREE.Mesh | null = null;

  const consider = (mesh: THREE.Mesh): void => {
    const unitKey = mesh.userData.mammothGrowTrayUnitKey;
    if (typeof unitKey !== "string") return;
    if (!clientOwnsClaimedApartmentUnit(conn, identity, unitKey)) return;

    mesh.getWorldPosition(_trayCenterScratch);
    const dx = feet.x - _trayCenterScratch.x;
    const dz = feet.z - _trayCenterScratch.z;
    if (dx * dx + dz * dz > radiusSq) return;

    _toTrayScratch.subVectors(_trayCenterScratch, _camPosScratch);
    const dist = _toTrayScratch.length();
    if (dist < 0.08) return;
    _toTrayScratch.multiplyScalar(1 / dist);
    const dot = _toTrayScratch.dot(_camDirScratch);
    if (dot < 0.82) return;

    const score = dot - dist * 0.04;
    if (score > bestScore) {
      bestScore = score;
      bestMesh = mesh;
    }
  };

  for (const mesh of trayPickMeshes) consider(mesh);
  if (bestMesh === null) {
    for (const mesh of slotPickMeshes) consider(mesh);
  }
  return bestMesh;
}

/** Resolve seed placement from ray hits, falling back to view-aimed tray when picks miss. */
export function resolveBalconyGrowPlacement(
  conn: DbConnection,
  identity: Identity | undefined,
  feet: { x: number; y: number; z: number },
  camera: THREE.PerspectiveCamera,
  hits: readonly THREE.Intersection[],
  trayPickMeshes: readonly THREE.Mesh[],
  slotPickMeshes: readonly THREE.Mesh[],
  growState: BalconyGrowOpUnitState,
): BalconyGrowPlacementRaycast | null {
  const seedCtx = readSeedHotbarContext(conn, identity);
  if (!seedCtx) return null;

  for (const hit of hits) {
    const placement = placementFromTrayHit(camera, hit, growState, seedCtx);
    if (placement) return placement;
  }

  if (!identity) return null;
  const aimedMesh = pickAimedGrowTrayMesh(
    conn,
    identity,
    feet,
    camera,
    trayPickMeshes,
    slotPickMeshes,
  );
  if (!aimedMesh) return null;

  const trayId = aimedMesh.userData.mammothGrowTrayId;
  const unitKey = aimedMesh.userData.mammothGrowTrayUnitKey;
  const trayRoot = aimedMesh.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
  if (typeof trayId !== "string" || typeof unitKey !== "string" || !trayRoot) return null;

  return placementForTray(camera, unitKey, trayId, trayRoot, growState, seedCtx);
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
  const def = getMammothItemDef(placement.seedDefId);
  const cropScale = def?.balconyGrow?.stageScale ?? 1;
  const soilLocalY = readGrowTraySoilLocalY(placement.trayObject);
  balconyGrowSlotWorldPosition(
    placement.trayObject.matrixWorld,
    placement.slotIndex,
    soilLocalY,
    _previewPosScratch,
    placement.trayObject,
  );
  preview.update(
    {
      worldPosition: _previewPosScratch,
      worldQuaternion: new THREE.Quaternion().setFromRotationMatrix(placement.trayObject.matrixWorld),
      scale: balconyGrowStageVisualScale("sapling", cropScale),
      balconyGrowTint: def?.balconyGrow?.stageTint ?? "#3d8b4a",
    },
    placement.valid,
  );
}

import * as THREE from "three";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import {
  BALCONY_GROW_TRAY_INTERACT_RADIUS_M,
  balconyGrowPlantReadyByDays,
  balconyGrowTrayStashKey,
  parseBalconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import { mammothBalconyGrowHarvestDisplayName } from "../../inventory/mammothItemCatalog";
import {
  clientOwnsClaimedApartmentUnit,
} from "../fpApartment/fpApartmentGameplay.js";
import { apartmentStashLabel, APARTMENT_STASH_KIND_GROW_TRAY } from "../fpApartment/fpApartmentStashKey.js";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import {
  balconyGrowLivePlantInSlot,
  resolveBalconyGrowSoilAimedSlotIndex,
} from "./fpBalconyGrowTrayAim.js";
import { clientFeetNearGrowTray, isBalconyGrowTrayCenterPick } from "./fpBalconyGrowTrayAnchor.js";

import type { FpApartmentStashRayOcclusion } from "../fpApartment/fpApartmentStashRayOcclusion.js";

export type BalconyGrowTrayPrompt =
  | {
      kind: "balcony_grow_harvest";
      unitKey: string;
      trayId: string;
      slotIndex: number;
      cropDisplayName: string;
    }
  | {
      kind: "balcony_grow_tray";
      unitKey: string;
      trayId: string;
      stashKey: string;
      stashLabel: string;
    };

function plantReadyForHarvest(plant: BalconyGrowOpUnitState["plants"][number]): boolean {
  return balconyGrowPlantReadyByDays(
    Number(plant.phase),
    Number(plant.daysGrown),
    Number(plant.targetDays),
  );
}

function harvestPromptIfNear(
  conn: DbConnection,
  identity: Identity,
  feet: { x: number; y: number; z: number },
  unitKey: string,
  trayId: string,
  slotIndex: number,
  cropDisplayName: string,
  trayRoot?: THREE.Object3D,
): BalconyGrowTrayPrompt | null {
  if (!clientFeetNearGrowTray(conn, identity, feet, unitKey, trayId, trayRoot)) {
    return null;
  }
  return {
    kind: "balcony_grow_harvest",
    unitKey,
    trayId,
    slotIndex,
    cropDisplayName,
  };
}

function growTrayStashPrompt(
  conn: DbConnection,
  identity: Identity,
  feet: { x: number; y: number; z: number },
  unitKey: string,
  trayId: string,
  trayRoot?: THREE.Object3D,
): BalconyGrowTrayPrompt | null {
  if (!clientOwnsClaimedApartmentUnit(conn, identity, unitKey)) return null;
  if (!clientFeetNearGrowTray(conn, identity, feet, unitKey, trayId, trayRoot)) return null;
  return {
    kind: "balcony_grow_tray",
    unitKey,
    trayId,
    stashKey: balconyGrowTrayStashKey(unitKey, trayId),
    stashLabel: apartmentStashLabel(APARTMENT_STASH_KIND_GROW_TRAY),
  };
}

function matureHarvestPromptForSlot(
  conn: DbConnection,
  identity: Identity,
  feet: { x: number; y: number; z: number },
  unitKey: string,
  trayId: string,
  slotIndex: number,
  growState: BalconyGrowOpUnitState,
  trayRoot?: THREE.Object3D,
): BalconyGrowTrayPrompt | null {
  const plant = growState.plants.find(
    (p) => p.trayId === trayId && Number(p.slotIndex) === Number(slotIndex),
  );
  if (!plant || !plantReadyForHarvest(plant)) return null;
  const cropName = mammothBalconyGrowHarvestDisplayName(plant.cropDefId);
  return harvestPromptIfNear(
    conn,
    identity,
    feet,
    unitKey,
    trayId,
    slotIndex,
    cropName,
    trayRoot,
  );
}

export function getBalconyGrowTrayPromptFromHit(
  conn: DbConnection,
  identity: Identity | undefined,
  feet: { x: number; y: number; z: number },
  camera: THREE.PerspectiveCamera,
  hit: THREE.Intersection,
  growState: BalconyGrowOpUnitState,
): BalconyGrowTrayPrompt | null {
  if (!identity) return null;
  const unitKey = hit.object.userData.mammothGrowTrayUnitKey;
  const trayId = hit.object.userData.mammothGrowTrayId;
  const slotIndex = hit.object.userData.mammothGrowSlotIndex;
  if (typeof unitKey !== "string" || typeof trayId !== "string") return null;

  const trayRoot = hit.object.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
  if (isBalconyGrowTrayCenterPick(hit.object)) {
    return growTrayStashPrompt(conn, identity, feet, unitKey, trayId, trayRoot);
  }

  if (typeof slotIndex === "number") {
    const harvest = matureHarvestPromptForSlot(
      conn,
      identity,
      feet,
      unitKey,
      trayId,
      slotIndex,
      growState,
      trayRoot,
    );
    if (harvest) return harvest;
    if (balconyGrowLivePlantInSlot(growState, trayId, slotIndex)) {
      return null;
    }
    return growTrayStashPrompt(conn, identity, feet, unitKey, trayId, trayRoot);
  }

  if (trayRoot) {
    const aimedSlot = resolveBalconyGrowSoilAimedSlotIndex(camera, trayRoot);
    if (aimedSlot !== null) {
      const harvest = matureHarvestPromptForSlot(
        conn,
        identity,
        feet,
        unitKey,
        trayId,
        aimedSlot,
        growState,
        trayRoot,
      );
      if (harvest) return harvest;
      if (balconyGrowLivePlantInSlot(growState, trayId, aimedSlot)) {
        return null;
      }
    }
  }

  return growTrayStashPrompt(conn, identity, feet, unitKey, trayId, trayRoot);
}

const _camPosScratch = new THREE.Vector3();
const _camDirScratch = new THREE.Vector3();
const _toTrayScratch = new THREE.Vector3();
const _trayCenterScratch = new THREE.Vector3();

/** When the center-screen ray misses a flat floor pick, accept nearby trays in the view cone. */
export function balconyGrowTrayAimFallbackPrompt(
  conn: DbConnection,
  identity: Identity | undefined,
  feet: { x: number; y: number; z: number },
  camera: THREE.PerspectiveCamera,
  trayPickMeshes: readonly THREE.Mesh[],
  slotPickMeshes: readonly THREE.Mesh[],
  growState: BalconyGrowOpUnitState,
  stashRayOcclusion?: FpApartmentStashRayOcclusion,
  centerPickMeshes: readonly THREE.Mesh[] = [],
): BalconyGrowTrayPrompt | null {
  if (
    !identity ||
    (trayPickMeshes.length === 0 && slotPickMeshes.length === 0 && centerPickMeshes.length === 0)
  ) {
    return null;
  }

  camera.getWorldPosition(_camPosScratch);
  camera.getWorldDirection(_camDirScratch);

  const radiusSq =
    BALCONY_GROW_TRAY_INTERACT_RADIUS_M * BALCONY_GROW_TRAY_INTERACT_RADIUS_M;
  let bestScore = -Infinity;
  let bestUnitKey: string | null = null;
  let bestTrayId: string | null = null;
  let bestSlotIndex: number | undefined;

  const considerMesh = (mesh: THREE.Mesh, slotIndex?: number): void => {
    const unitKey = mesh.userData.mammothGrowTrayUnitKey;
    const trayId = mesh.userData.mammothGrowTrayId;
    if (typeof unitKey !== "string" || typeof trayId !== "string") return;
    if (!clientOwnsClaimedApartmentUnit(conn, identity, unitKey)) return;

    mesh.getWorldPosition(_trayCenterScratch);
    if (stashRayOcclusion?.targetOccludedFromCamera(camera, _trayCenterScratch)) return;
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
      bestUnitKey = unitKey;
      bestTrayId = trayId;
      bestSlotIndex = slotIndex;
    }
  };

  for (const mesh of trayPickMeshes) {
    considerMesh(mesh);
  }

  if (bestTrayId === null) {
    for (const mesh of slotPickMeshes) {
      const slotIndex = mesh.userData.mammothGrowSlotIndex;
      considerMesh(mesh, typeof slotIndex === "number" ? slotIndex : undefined);
    }
  }

  if (bestUnitKey === null || bestTrayId === null) return null;

  const trayMesh = trayPickMeshes.find((mesh) => mesh.userData.mammothGrowTrayId === bestTrayId);
  const trayRoot = trayMesh?.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;

  if (bestSlotIndex !== undefined) {
    const harvest = matureHarvestPromptForSlot(
      conn,
      identity,
      feet,
      bestUnitKey,
      bestTrayId,
      bestSlotIndex,
      growState,
      trayRoot,
    );
    if (harvest) return harvest;
    if (balconyGrowLivePlantInSlot(growState, bestTrayId, bestSlotIndex)) {
      return null;
    }
  } else if (trayRoot) {
    const aimedSlot = resolveBalconyGrowSoilAimedSlotIndex(camera, trayRoot);
    if (aimedSlot !== null) {
      const harvest = matureHarvestPromptForSlot(
        conn,
        identity,
        feet,
        bestUnitKey,
        bestTrayId,
        aimedSlot,
        growState,
        trayRoot,
      );
      if (harvest) return harvest;
      if (balconyGrowLivePlantInSlot(growState, bestTrayId, aimedSlot)) {
        return null;
      }
    }
  }

  return growTrayStashPrompt(conn, identity, feet, bestUnitKey, bestTrayId, trayRoot);
}

export function resolveBalconyGrowTrayPrompt(
  conn: DbConnection,
  identity: Identity | undefined,
  feet: { x: number; y: number; z: number },
  camera: THREE.PerspectiveCamera,
  hits: readonly THREE.Intersection[],
  trayPickMeshes: readonly THREE.Mesh[],
  slotPickMeshes: readonly THREE.Mesh[],
  growState: BalconyGrowOpUnitState,
  stashRayOcclusion?: FpApartmentStashRayOcclusion,
  centerPickMeshes: readonly THREE.Mesh[] = [],
): BalconyGrowTrayPrompt | null {
  if (!identity) return null;
  for (const hit of hits) {
    const trayId = hit.object.userData.mammothGrowTrayId;
    const unitKey = hit.object.userData.mammothGrowTrayUnitKey;
    if (typeof trayId !== "string" || typeof unitKey !== "string") continue;

    const trayRoot = hit.object.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
    if (isBalconyGrowTrayCenterPick(hit.object)) {
      const stash = growTrayStashPrompt(conn, identity, feet, unitKey, trayId, trayRoot);
      if (stash) return stash;
      continue;
    }

    const slotIndex =
      typeof hit.object.userData.mammothGrowSlotIndex === "number"
        ? hit.object.userData.mammothGrowSlotIndex
        : trayRoot
          ? resolveBalconyGrowSoilAimedSlotIndex(camera, trayRoot)
          : null;
    if (slotIndex !== null) {
      const harvest = matureHarvestPromptForSlot(
        conn,
        identity,
        feet,
        unitKey,
        trayId,
        slotIndex,
        growState,
        trayRoot,
      );
      if (harvest) return harvest;
    }

    const prompt = getBalconyGrowTrayPromptFromHit(
      conn,
      identity,
      feet,
      camera,
      hit,
      growState,
    );
    if (prompt) return prompt;
  }

  return balconyGrowTrayAimFallbackPrompt(
    conn,
    identity,
    feet,
    camera,
    trayPickMeshes,
    slotPickMeshes,
    growState,
    stashRayOcclusion,
    centerPickMeshes,
  );
}

export { parseBalconyGrowTrayStashKey };

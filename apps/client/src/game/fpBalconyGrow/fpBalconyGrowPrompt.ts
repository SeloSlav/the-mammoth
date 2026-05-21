import * as THREE from "three";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import {
  BALCONY_GROW_TRAY_BUILTIN_IDS,
  BALCONY_GROW_TRAY_INTERACT_RADIUS_M,
  balconyGrowTrayStashKey,
  parseBalconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import { getMammothItemDef } from "../../inventory/mammothItemCatalog";
import {
  clientMayUseApartmentStash,
  clientOwnsClaimedApartmentUnit,
} from "../fpApartment/fpApartmentGameplay.js";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";

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

const PHASE_MATURE = 2;

function growTrayStashPrompt(
  conn: DbConnection,
  identity: Identity,
  feet: { x: number; y: number; z: number },
  unitKey: string,
  trayId: string,
  fromRaycastHit: boolean,
): BalconyGrowTrayPrompt | null {
  const stashKey = balconyGrowTrayStashKey(unitKey, trayId);
  const allowed = fromRaycastHit
    ? clientOwnsClaimedApartmentUnit(conn, identity, unitKey)
    : clientMayUseApartmentStash(conn, identity, stashKey, feet);
  if (!allowed) {
    return null;
  }
  return {
    kind: "balcony_grow_tray",
    unitKey,
    trayId,
    stashKey,
    stashLabel: "grow tray fertilizer",
  };
}

export function getBalconyGrowTrayPromptFromHit(
  conn: DbConnection,
  identity: Identity | undefined,
  feet: { x: number; y: number; z: number },
  hit: THREE.Intersection,
  growState: BalconyGrowOpUnitState,
): BalconyGrowTrayPrompt | null {
  if (!identity) return null;
  const unitKey = hit.object.userData.mammothGrowTrayUnitKey;
  const trayId = hit.object.userData.mammothGrowTrayId;
  const slotIndex = hit.object.userData.mammothGrowSlotIndex;
  if (typeof unitKey !== "string" || typeof trayId !== "string") return null;

  if (typeof slotIndex === "number") {
    const plant = growState.plants.find(
      (p) => p.trayId === trayId && p.slotIndex === slotIndex,
    );
    if (plant?.phase === PHASE_MATURE) {
      const cropName =
        getMammothItemDef(plant.cropDefId)?.displayName ?? plant.cropDefId;
      return {
        kind: "balcony_grow_harvest",
        unitKey,
        trayId,
        slotIndex,
        cropDisplayName: cropName,
      };
    }
    return growTrayStashPrompt(conn, identity, feet, unitKey, trayId, true);
  }

  return growTrayStashPrompt(conn, identity, feet, unitKey, trayId, true);
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
): BalconyGrowTrayPrompt | null {
  if (!identity || (trayPickMeshes.length === 0 && slotPickMeshes.length === 0)) return null;

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
    const dx = feet.x - _trayCenterScratch.x;
    const dz = feet.z - _trayCenterScratch.z;
    if (dx * dx + dz * dz > radiusSq) return;

    _toTrayScratch.subVectors(_trayCenterScratch, _camPosScratch);
    const dist = _toTrayScratch.length();
    if (dist < 0.08) return;
    _toTrayScratch.multiplyScalar(1 / dist);
    const dot = _toTrayScratch.dot(_camDirScratch);
    if (dot < 0.75) return;

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

  if (bestSlotIndex !== undefined) {
    const plant = growState.plants.find(
      (p) => p.trayId === bestTrayId && p.slotIndex === bestSlotIndex,
    );
    if (plant?.phase === PHASE_MATURE) {
      const cropName =
        getMammothItemDef(plant.cropDefId)?.displayName ?? plant.cropDefId;
      return {
        kind: "balcony_grow_harvest",
        unitKey: bestUnitKey,
        trayId: bestTrayId,
        slotIndex: bestSlotIndex,
        cropDisplayName: cropName,
      };
    }
  }

  return growTrayStashPrompt(conn, identity, feet, bestUnitKey, bestTrayId, true);
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
): BalconyGrowTrayPrompt | null {
  for (const hit of hits) {
    const prompt = getBalconyGrowTrayPromptFromHit(
      conn,
      identity,
      feet,
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
  );
}

export function isKnownGrowTrayBuiltinId(trayId: string): boolean {
  return (BALCONY_GROW_TRAY_BUILTIN_IDS as readonly string[]).includes(trayId);
}

export { parseBalconyGrowTrayStashKey };

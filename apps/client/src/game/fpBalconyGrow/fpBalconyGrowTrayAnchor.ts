import * as THREE from "three";
import {
  BALCONY_GROW_TRAY_AUTHORED_FX_FZ,
  BALCONY_GROW_TRAY_INTERACT_RADIUS_M,
  balconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import { mapOwnedApartmentLayoutFractionToWorldX } from "@the-mammoth/world";
import type { Identity } from "spacetimedb";
import type { ApartmentUnit } from "../../module_bindings/types";
import type { DbConnection } from "../../module_bindings";
import { clientMayUseApartmentStash, clientOwnsClaimedApartmentUnit } from "../fpApartment/fpApartmentGameplay.js";
import {
  peekOwnedApartmentBuiltinsDoc,
  resolveApartmentDecorPoses,
} from "../fpApartment/fpOwnedApartmentBuiltinsFromContent.js";

/** World XZ for a grow tray — DB row when valid, else authored JSON fractions. */
export function resolveBalconyGrowTrayAnchorXZ(
  conn: DbConnection,
  unit: ApartmentUnit,
  trayId: string,
): { x: number; z: number } | null {
  for (const row of conn.db.balcony_grow_tray) {
    if (row.unitKey !== unit.unitKey || row.trayId !== trayId) continue;
    if (Math.abs(row.posX) > 0.02 || Math.abs(row.posZ) > 0.02) {
      return { x: row.posX, z: row.posZ };
    }
  }

  const doc = peekOwnedApartmentBuiltinsDoc();
  if (doc) {
    for (const pose of resolveApartmentDecorPoses(unit, doc)) {
      if (pose.id === trayId && pose.modelRelPath.includes("grow-tray.glb")) {
        return { x: pose.x, z: pose.z };
      }
    }
  }

  const frac = BALCONY_GROW_TRAY_AUTHORED_FX_FZ[trayId];
  if (!frac) return null;
  const spanZ = unit.boundMaxZ - unit.boundMinZ;
  return {
    x: mapOwnedApartmentLayoutFractionToWorldX(
      unit.boundMinX,
      unit.boundMaxX,
      unit.unitId,
      frac.fx,
    ),
    z: unit.boundMinZ + frac.fz * spanZ,
  };
}

export { BALCONY_GROW_TRAY_INTERACT_RADIUS_M };

/** Plant picks win over slot/tray picks — plants sit above the tray volume. */
export function balconyGrowPickRayPriority(obj: THREE.Object3D): number {
  if (obj.userData.mammothGrowPlantPick === true) return 0;
  if (typeof obj.userData.mammothGrowSlotIndex === "number") return 1;
  return 2;
}

export function sortBalconyGrowRaycastHits(hits: THREE.Intersection[]): THREE.Intersection[] {
  return hits.sort((a, b) => {
    const priority = balconyGrowPickRayPriority(a.object) - balconyGrowPickRayPriority(b.object);
    if (priority !== 0) return priority;
    return a.distance - b.distance;
  });
}

/** Feet within grow-tray reach — uses decor world position when available (matches rendered tray). */
export function clientFeetNearGrowTray(
  conn: DbConnection,
  identity: Identity | undefined,
  feet: { x: number; y: number; z: number },
  unitKey: string,
  trayId: string,
  trayRoot?: THREE.Object3D,
): boolean {
  let growTrayAnchorXZ: { x: number; z: number } | undefined;
  if (trayRoot) {
    trayRoot.getWorldPosition(_trayNearScratch);
    growTrayAnchorXZ = { x: _trayNearScratch.x, z: _trayNearScratch.z };
  }
  return clientMayUseApartmentStash(
    conn,
    identity,
    balconyGrowTrayStashKey(unitKey, trayId),
    feet,
    growTrayAnchorXZ ? { growTrayAnchorXZ } : undefined,
  );
}

export function isBalconyGrowPickMesh(mesh: THREE.Object3D): mesh is THREE.Mesh {
  return (
    mesh instanceof THREE.Mesh &&
    typeof mesh.userData.mammothGrowTrayId === "string" &&
    typeof mesh.userData.mammothGrowTrayUnitKey === "string"
  );
}

function growTrayDecorVisibleInHierarchy(mesh: THREE.Mesh): boolean {
  const root = mesh.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
  const probe = root ?? mesh;
  for (let cur: THREE.Object3D | null = probe; cur; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

const _trayNearScratch = new THREE.Vector3();
const _trayInteractRadiusSq =
  BALCONY_GROW_TRAY_INTERACT_RADIUS_M * BALCONY_GROW_TRAY_INTERACT_RADIUS_M;

function playerNearGrowTrayPick(
  mesh: THREE.Mesh,
  playerPos: { x: number; y: number; z: number },
): boolean {
  if (growTrayDecorVisibleInHierarchy(mesh)) return true;
  const root = mesh.userData.mammothGrowTrayRoot as THREE.Object3D | undefined;
  (root ?? mesh).getWorldPosition(_trayNearScratch);
  const dx = playerPos.x - _trayNearScratch.x;
  const dz = playerPos.z - _trayNearScratch.z;
  return dx * dx + dz * dz <= _trayInteractRadiusSq;
}

/**
 * Grow-tray picks participate in raycasts when the decor is visible (normal in-unit props) or when
 * the player is beside a hidden balcony tray — never apartment-wide.
 */
export function collectOwnedBalconyGrowPickMeshes(
  conn: DbConnection,
  identity: Identity | undefined,
  playerPos: { x: number; y: number; z: number },
  trayPicks: readonly THREE.Mesh[],
  slotPicks: readonly THREE.Mesh[],
  dst: THREE.Mesh[],
  plantPicks: readonly THREE.Mesh[] = [],
): void {
  dst.length = 0;
  if (!identity) return;

  const consider = (mesh: THREE.Mesh): void => {
    const unitKey = mesh.userData.mammothGrowTrayUnitKey as string;
    if (!clientOwnsClaimedApartmentUnit(conn, identity, unitKey)) return;
    if (!playerNearGrowTrayPick(mesh, playerPos)) return;
    dst.push(mesh);
  };

  for (let i = 0; i < plantPicks.length; i++) {
    const mesh = plantPicks[i]!;
    if (!mesh.visible) continue;
    consider(mesh);
  }
  for (let i = 0; i < trayPicks.length; i++) consider(trayPicks[i]!);
  for (let i = 0; i < slotPicks.length; i++) consider(slotPicks[i]!);
}

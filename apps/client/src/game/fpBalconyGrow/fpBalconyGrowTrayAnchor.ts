import * as THREE from "three";
import {
  BALCONY_GROW_TRAY_AUTHORED_FX_FZ,
  BALCONY_GROW_TRAY_INTERACT_RADIUS_M,
} from "@the-mammoth/schemas";
import { mapOwnedApartmentLayoutFractionToWorldX } from "@the-mammoth/world";
import type { Identity } from "spacetimedb";
import type { ApartmentUnit } from "../../module_bindings/types";
import type { DbConnection } from "../../module_bindings";
import { clientOwnsClaimedApartmentUnit } from "../fpApartment/fpApartmentGameplay.js";
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

export function isBalconyGrowPickMesh(mesh: THREE.Object3D): mesh is THREE.Mesh {
  return (
    mesh instanceof THREE.Mesh &&
    typeof mesh.userData.mammothGrowTrayId === "string" &&
    typeof mesh.userData.mammothGrowTrayUnitKey === "string"
  );
}

/**
 * Grow-tray pick meshes stay in the scene while decor GLBs may be hidden (balcony sits outside the
 * strict in-unit visibility hull). Interact raycasts use ownership + tray anchor proximity instead.
 */
export function collectOwnedBalconyGrowPickMeshes(
  conn: DbConnection,
  identity: Identity | undefined,
  _playerPos: { x: number; y: number; z: number },
  trayPicks: readonly THREE.Mesh[],
  slotPicks: readonly THREE.Mesh[],
  dst: THREE.Mesh[],
): void {
  dst.length = 0;
  if (!identity) return;

  const consider = (mesh: THREE.Mesh): void => {
    const unitKey = mesh.userData.mammothGrowTrayUnitKey as string;
    if (!clientOwnsClaimedApartmentUnit(conn, identity, unitKey)) return;
    dst.push(mesh);
  };

  for (let i = 0; i < trayPicks.length; i++) consider(trayPicks[i]!);
  for (let i = 0; i < slotPicks.length; i++) consider(slotPicks[i]!);
}

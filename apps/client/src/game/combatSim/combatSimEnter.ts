import type { DbConnection } from "../../module_bindings";
import {
  ownedApartmentBuiltinsDoc,
  type OwnedApartmentNpcCombatSpawn,
} from "@the-mammoth/schemas";
import { resolveOwnedApartmentNpcCombatSpawnsWorld } from "@the-mammoth/world";

/** Disk-authored spawns from `content/apartment/owned_apartment_builtins.json` (client dev + editor save). */
export async function loadAuthoredNpcCombatSpawnsFromContent(): Promise<
  OwnedApartmentNpcCombatSpawn[]
> {
  try {
    const res = await fetch("/content/apartment/owned_apartment_builtins.json");
    if (!res.ok) return [];
    return ownedApartmentBuiltinsDoc(await res.json()).npcCombatSpawns;
  } catch {
    return [];
  }
}

export type CombatSimUnitContext = {
  unitKey: string;
  unitId: string;
  footY: number;
  boundMinX: number;
  boundMaxX: number;
  boundMinZ: number;
  boundMaxZ: number;
};

export async function syncCombatNpcSpawnsToServer(
  conn: DbConnection,
  unit: CombatSimUnitContext,
  spawns: readonly OwnedApartmentNpcCombatSpawn[],
): Promise<void> {
  await conn.reducers.clearCombatSimNpcSpawns({ unitKey: unit.unitKey });
  const worldSpawns = resolveOwnedApartmentNpcCombatSpawnsWorld({
    unitId: unit.unitId,
    footY: unit.footY,
    boundMinX: unit.boundMinX,
    boundMaxX: unit.boundMaxX,
    boundMinZ: unit.boundMinZ,
    boundMaxZ: unit.boundMaxZ,
    spawns,
  });
  for (const s of worldSpawns) {
    await conn.reducers.addCombatSimNpcSpawn({
      unitKey: unit.unitKey,
      archetype: s.archetype,
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
    });
  }
}

export async function prepareAndEnterCombatSim(
  conn: DbConnection,
  unit: CombatSimUnitContext,
  spawns: readonly OwnedApartmentNpcCombatSpawn[],
): Promise<void> {
  await syncCombatNpcSpawnsToServer(conn, unit, spawns);
  await conn.reducers.enterCombatSim({});
}

/** Resolve owned claimed unit row for the local identity (combat sim entry). */
export function findOwnedApartmentUnitForIdentity(
  conn: DbConnection,
): CombatSimUnitContext | null {
  if (!conn.identity) return null;
  for (const u of conn.db.apartment_unit.iter()) {
    if (u.owner?.isEqual(conn.identity) && u.state === 1) {
      return {
        unitKey: u.unitKey,
        unitId: u.unitId,
        footY: u.footY,
        boundMinX: u.boundMinX,
        boundMaxX: u.boundMaxX,
        boundMinZ: u.boundMinZ,
        boundMaxZ: u.boundMaxZ,
      };
    }
  }
  return null;
}

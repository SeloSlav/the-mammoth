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

/** Wait until the local identity owns a claimed apartment row (post-`on_connect` auto-grant). */
export function waitForOwnedApartmentUnit(
  conn: DbConnection,
  timeoutMs = 4_000,
): Promise<CombatSimUnitContext | null> {
  const existing = findOwnedApartmentUnitForIdentity(conn);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const finish = (unit: CombatSimUnitContext | null) => {
      if (settled) return;
      settled = true;
      if (poll !== null) clearInterval(poll);
      conn.db.apartment_unit.removeOnInsert(onInsert);
      conn.db.apartment_unit.removeOnUpdate(onUpdate);
      resolve(unit);
    };

    const tryResolve = (): CombatSimUnitContext | null =>
      findOwnedApartmentUnitForIdentity(conn);

    const onInsert = () => {
      const unit = tryResolve();
      if (unit) finish(unit);
    };
    const onUpdate = () => {
      const unit = tryResolve();
      if (unit) finish(unit);
    };

    conn.db.apartment_unit.onInsert(onInsert);
    conn.db.apartment_unit.onUpdate(onUpdate);

    const deadline = performance.now() + timeoutMs;
    poll = setInterval(() => {
      const unit = tryResolve();
      if (unit) {
        finish(unit);
        return;
      }
      if (performance.now() >= deadline) {
        finish(null);
      }
    }, 40);
  });
}

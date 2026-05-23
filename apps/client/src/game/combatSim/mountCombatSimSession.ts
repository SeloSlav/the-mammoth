import type { DbConnection } from "../../module_bindings";
import { mountFpSession } from "../mountFpSession.js";
import { preloadBabushkaNpcBody } from "@the-mammoth/engine";
import {
  findOwnedApartmentUnitForIdentity,
  loadAuthoredNpcCombatSpawnsFromContent,
  prepareAndEnterCombatSim,
  type CombatSimUnitContext,
} from "./combatSimEnter.js";
import { waitForCombatSimBabushkaRow } from "./waitForCombatSimWorldNpc.js";
import type { OwnedApartmentNpcCombatSpawn } from "@the-mammoth/schemas";

export type MountCombatSimSessionOptions = {
  /** When set, sync these spawns before enter (editor builtins). Otherwise server default spawn. */
  npcSpawns?: readonly OwnedApartmentNpcCombatSpawn[];
  /** Pre-resolved unit context (editor preview unit). Falls back to owned claimed unit. */
  unitContext?: CombatSimUnitContext | null;
  apartmentClaimsAllowed?: boolean;
  onMountPhase?: (phase: string) => void;
};

/**
 * Combat sim entry — **one gameplay stack**, not a fork.
 *
 * Call chain: `mountCombatSimSession` → server `enter_combat_sim` → `mountFpSession({ combatSimMode: true })`.
 * Editor combat-sim play and client `?combatSim=1` both use this path.
 *
 * **Shared with live FP** (same code, same reducers):
 * - `mountFpSession` — locomotion, hotbar, reticule, vitals, `submitFirearmShot` / `submitMeleeSwing`
 * - Server — `world_npc` AI tick, hitscan NPC damage, player vitals, inventory
 *
 * **Arena shell only** (no second combat implementation):
 * - Server — `enter_combat_sim` / `leave_combat_sim`, loadout grant, `combat_sim:{unit_key}` spawns, open-arena LOS
 * - Client — `createCombatSimStaticWorld` (concrete pad + walls), outdoor arena lighting
 * - Client — apartment-only mounts replaced by inert stubs in `fpSession/fpSessionInertSubsystems.ts`
 *   (elevators, doors, decor meshes, balcony grow). Same interfaces, no-ops where the megablock is absent.
 */
export async function mountCombatSimSession(
  canvas: HTMLCanvasElement,
  conn: DbConnection,
  opts: MountCombatSimSessionOptions = {},
): Promise<() => void> {
  const report = (phase: string) => opts.onMountPhase?.(phase);
  report("sync_spawns");
  const spawns =
    opts.npcSpawns ?? (await loadAuthoredNpcCombatSpawnsFromContent());
  const unit = opts.unitContext ?? findOwnedApartmentUnitForIdentity(conn);
  report("enter_combat_sim");
  if (unit) {
    await prepareAndEnterCombatSim(conn, unit, spawns);
  } else {
    await conn.reducers.enterCombatSim({});
  }

  report("wait_combat_npc");
  const [, babushkaRow] = await Promise.all([
    preloadBabushkaNpcBody(),
    waitForCombatSimBabushkaRow(conn),
  ]);
  if (!babushkaRow) {
    console.warn(
      "[combatSim] no babushka world_npc row after enter_combat_sim — check claimed apartment / server deploy",
    );
  }

  report("load_fp_session");
  const disposeFp = await mountFpSession(canvas, conn, {
    apartmentClaimsAllowed: opts.apartmentClaimsAllowed ?? false,
    combatSimMode: true,
  });
  report("ready");
  return () => {
    disposeFp();
    void conn.reducers.leaveCombatSim({});
  };
}

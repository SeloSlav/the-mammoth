import type { DbConnection } from "../../module_bindings";
import { mountFpSession } from "../mountFpSession.js";
import {
  findOwnedApartmentUnitForIdentity,
  loadAuthoredNpcCombatSpawnsFromContent,
  prepareAndEnterCombatSim,
  type CombatSimUnitContext,
} from "./combatSimEnter.js";
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
 * What is shared with live FP (identical code paths):
 * - Client: `mountFpSession` → locomotion, hotbar, `submitFirearmShot` / `submitMeleeSwing`, presentation
 * - Server: `world_npc` AI, hitscan NPC damage, vitals, inventory — same reducers as in-apartment combat
 *
 * What differs (arena shell only):
 * - Server: `enter_combat_sim` / `leave_combat_sim` (loadout, spawn/despawn, session_key)
 * - Client: `combatSimMode` → empty arena static world + inert apartment subsystems (no megablock)
 * - Server: open-arena firearm LOS while live combat-sim NPCs exist (client has no building mesh)
 *
 * Editor and `?combatSim=1` both call this; there is no second combat implementation.
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

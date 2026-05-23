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
 * DRY combat-sim entry: full FP session (locomotion, hotbar, presentation, NPC sync) +
 * authoritative `enter_combat_sim` on the server.
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

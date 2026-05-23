import * as THREE from "three";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import type { PlayerPose, PlayerVitals } from "../../module_bindings/types";
import { createFpBloodBurstFx, type FpBloodBurstFx } from "./fpBloodBurstFx.js";

const HEALTH_DROP_EPS = 0.05;
/** Ignore hunger/thirst micro-ticks (~<1 HP / slow vitals tick); melee & typical pellets exceed this. */
const MIN_DAMAGE_FOR_BLOOD_FX = 1;
const TORSO_Y_ABOVE_FEET_M = 1.04;

export type FpPlayerDamageBloodSquirt = {
  tick: (nowMs: number, dtSec: number) => void;
  dispose: () => void;
};

export function createFpPlayerDamageBloodSquirt(opts: {
  scene: THREE.Scene;
  /** Writes predicted local feet (world) into `out`. */
  getLocalFeetWorld: (out: THREE.Vector3) => void;
  conn: DbConnection;
}): FpPlayerDamageBloodSquirt {
  const bloodFx: FpBloodBurstFx = createFpBloodBurstFx(opts.scene);
  const scratchOrigin = new THREE.Vector3();

  const resolveVictimChestWorld = (victim: Identity): THREE.Vector3 | null => {
    const self = opts.conn.identity;
    if (self?.isEqual(victim)) {
      opts.getLocalFeetWorld(scratchOrigin);
      scratchOrigin.y += TORSO_Y_ABOVE_FEET_M;
      return scratchOrigin.clone();
    }
    const pose = opts.conn.db.player_pose.identity.find(victim) as PlayerPose | undefined;
    if (!pose) return null;
    scratchOrigin.set(pose.x, pose.y + TORSO_Y_ABOVE_FEET_M, pose.z);
    return scratchOrigin.clone();
  };

  const onVitalsUpdate = (_ctx: unknown, oldRow: PlayerVitals, newRow: PlayerVitals): void => {
    if (newRow.health >= oldRow.health - HEALTH_DROP_EPS) return;
    const damage = oldRow.health - newRow.health;
    if (damage < MIN_DAMAGE_FOR_BLOOD_FX) return;
    const p = resolveVictimChestWorld(newRow.identity);
    if (!p) return;
    bloodFx.spawnBurstAt(p.x, p.y, p.z, damage);
  };

  opts.conn.db.player_vitals.onUpdate(onVitalsUpdate);

  return {
    tick(nowMs, dtSec) {
      bloodFx.tick(nowMs, dtSec);
    },
    dispose() {
      opts.conn.db.player_vitals.removeOnUpdate(onVitalsUpdate);
      bloodFx.dispose();
    },
  };
}

import * as THREE from "three";
import type { DbConnection } from "../../module_bindings";
import type { PlayerVitals } from "../../module_bindings/types";
import { isFpDebugGameplayFeedbackEnabled } from "../fpDebugGameplayFeedback.js";

const HEALTH_DROP_EPS = 0.05;
/** Ignore hunger/thirst micro-ticks; combat hits exceed this — matches blood FX / vignette gate. */
const MIN_DAMAGE_FOR_SHAKE = 1;

/** Peak local camera offset at trauma = 1 (metres). */
const MAX_SHAKE_POS_X_M = 0.011;
const MAX_SHAKE_POS_Y_M = 0.014;
const MAX_SHAKE_POS_Z_M = 0.006;
/** Roll (rad) at trauma = 1. */
const MAX_SHAKE_ROLL_RAD = 0.022;

const TRAUMA_DECAY_PER_SEC = 8.5;

/** Trauma impulse from a single damage event (0–1). */
export function computePlayerDamageTraumaAdd(damage: number): number {
  return Math.min(1, 0.28 + damage / 38);
}

export type FpPlayerDamageScreenShake = {
  applyToCamera: (camera: THREE.PerspectiveCamera, nowMs: number, dtSec: number) => void;
  dispose: () => void;
};

export function createFpPlayerDamageScreenShake(opts: {
  conn: DbConnection;
}): FpPlayerDamageScreenShake {
  let trauma = 0;
  let shakeSeed = 0;

  const onVitalsUpdate = (_ctx: unknown, oldRow: PlayerVitals, newRow: PlayerVitals): void => {
    const self = opts.conn.identity;
    if (!self?.isEqual(newRow.identity)) return;
    if (newRow.health >= oldRow.health - HEALTH_DROP_EPS) return;

    const damage = oldRow.health - newRow.health;
    if (
      !isFpDebugGameplayFeedbackEnabled("starvationDamageFlashes") &&
      damage < MIN_DAMAGE_FOR_SHAKE
    ) {
      return;
    }

    const add = computePlayerDamageTraumaAdd(damage);
    trauma = Math.min(1, trauma + add);
    shakeSeed += 1.7 + damage * 0.03;
  };

  opts.conn.db.player_vitals.onUpdate(onVitalsUpdate);

  const applyToCamera = (camera: THREE.PerspectiveCamera, nowMs: number, dtSec: number): void => {
    if (trauma <= 1e-4) return;

    trauma *= Math.exp(-TRAUMA_DECAY_PER_SEC * dtSec);
    if (trauma <= 1e-4) {
      trauma = 0;
      return;
    }

    const t = nowMs * 0.001;
    const s = trauma * trauma;
    const phase = shakeSeed;

    const nx =
      Math.sin(t * 38.7 + phase) * 0.55 + Math.sin(t * 53.2 + phase * 1.31) * 0.45;
    const ny =
      Math.sin(t * 44.1 + phase * 0.82) * 0.5 + Math.sin(t * 61.0 + phase * 0.47) * 0.5;
    const nz = Math.sin(t * 49.6 + phase * 1.12) * 0.6 + Math.sin(t * 33.4 + phase) * 0.4;
    const nr =
      Math.sin(t * 29.3 + phase * 0.63) * 0.62 + Math.sin(t * 47.8 + phase * 1.9) * 0.38;

    camera.position.x += nx * MAX_SHAKE_POS_X_M * s;
    camera.position.y += ny * MAX_SHAKE_POS_Y_M * s;
    camera.position.z += nz * MAX_SHAKE_POS_Z_M * s;
    camera.rotation.z += nr * MAX_SHAKE_ROLL_RAD * s;
  };

  return {
    applyToCamera,
    dispose() {
      opts.conn.db.player_vitals.removeOnUpdate(onVitalsUpdate);
    },
  };
}

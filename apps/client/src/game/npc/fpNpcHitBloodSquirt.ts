import type * as THREE from "three";
import { createFpBloodBurstFx, type FpBloodBurstFx } from "../fpSession/fpBloodBurstFx.js";

const TORSO_Y_ABOVE_FEET_M = 1.04;
const DEFAULT_HIT_DAMAGE_VIS = 12;

export type FpNpcHitBloodSquirt = FpBloodBurstFx & {
  spawnAtNpcFeet: (feetX: number, feetY: number, feetZ: number, damage?: number) => void;
};

export function createFpNpcHitBloodSquirt(scene: THREE.Scene): FpNpcHitBloodSquirt {
  const fx = createFpBloodBurstFx(scene, "fp_npc_hit_blood_fx");
  return {
    ...fx,
    spawnAtNpcFeet(feetX, feetY, feetZ, damage = DEFAULT_HIT_DAMAGE_VIS): void {
      fx.spawnBurstAt(feetX, feetY + TORSO_Y_ABOVE_FEET_M, feetZ, damage);
    },
  };
}

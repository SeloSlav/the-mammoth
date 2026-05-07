import type { HeldItemId } from "./ids.js";

/**
 * Minimal inputs for third-person held-weapon visuals (GLB + procedural swing / muzzle flash).
 * Satisfied by {@link ReplicatedPlayerSnapshot}; local mirror maps melee/fire counters from
 * {@link LocalPlayerGameplayState}.
 */
export type ThirdPersonWeaponPresentationDrive = {
  equippedPrimary: HeldItemId;
  /** Remote: `meleePresentationSeq`; local mirror: `meleeAttackSeq`. */
  meleePresentationSeq: number;
  /** Remote: `firearmPresentationSeq`; local mirror: `firearmShotSeq`. */
  firearmPresentationSeq: number;
};

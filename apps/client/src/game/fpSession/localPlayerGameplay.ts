import type { HeldItemId, LocalPlayerGameplayState, LocomotionPresentation } from "@the-mammoth/game";
import { derivePlayerAnimationIntent } from "@the-mammoth/game";
import * as THREE from "three";
import { locomotionFromHorizontalSpeed } from "@the-mammoth/net";
import { effectiveDevGameplayEquippedPrimary } from "../fpDev/devGameplayWeaponOverride.js";

export function buildLocalPlayerGameplayState(args: {
  playerIdHex: string;
  pos: THREE.Vector3;
  yawRad: number;
  pitchRad: number;
  freeLookActive: boolean;
  stridePhaseRad: number;
  vel: THREE.Vector3;
  grounded: boolean;
  crouch: boolean;
  meleeAttackSeq: number;
  firearmShotSeq: number;
  /** True while holding ADS with a ranged hotbar weapon (drives viewmodel aim blend). */
  firearmAimActive?: boolean;
  /** Stepped reload presentation while chambering. */
  firearmReload?: { progress01: number; roundsToLoad: number };
  /** From hotbar + item `defId` (before dev-only override). */
  equippedPrimaryFromHotbar: HeldItemId;
}): LocalPlayerGameplayState {
  const stance = args.crouch ? "crouch" : "stand";
  const locomotion: LocomotionPresentation = locomotionFromHorizontalSpeed(
    args.vel.x,
    args.vel.z,
  );
  const reloadActive = args.firearmReload != null;
  const animation = derivePlayerAnimationIntent({
    locomotion,
    stance,
    meleeSwingActive: false,
    reloadActive,
    aimWeight01: args.firearmAimActive ? 1 : 0,
  });
  return {
    kind: "local",
    playerIdHex: args.playerIdHex,
    position: { x: args.pos.x, y: args.pos.y, z: args.pos.z },
    yawRad: args.yawRad,
    pitchRad: args.pitchRad,
    freeLookActive: args.freeLookActive,
    stridePhaseRad: args.stridePhaseRad,
    velocity: { x: args.vel.x, y: args.vel.y, z: args.vel.z },
    grounded: args.grounded,
    stance,
    locomotion,
    equippedPrimary: effectiveDevGameplayEquippedPrimary(args.equippedPrimaryFromHotbar),
    meleeAttackSeq: args.meleeAttackSeq,
    firearmShotSeq: args.firearmShotSeq,
    firearmReload: args.firearmReload,
    primaryAction: "none",
    life: "alive",
    animation,
  };
}

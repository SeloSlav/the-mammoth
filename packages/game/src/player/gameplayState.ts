import type { PlayerAnimationIntent } from "./animationIntent.js";
import type { PlayerPrimaryAction, PlayerLifePhase } from "./action.js";
import type { HeldItemId, PlayerIdHex } from "./ids.js";
import type { LocomotionPresentation, PlayerStance } from "./stance.js";

export type Vec3 = { x: number; y: number; z: number };

/**
 * Authoritative gameplay-facing snapshot for the local controllable player.
 * No Three.js types — safe for packages/game consumers.
 */
export type LocalPlayerGameplayState = {
  kind: "local";
  playerIdHex: PlayerIdHex;
  /** World-space foot / capsule base (matches current FP rig origin). */
  position: Vec3;
  /** Body yaw (radians). */
  yawRad: number;
  /** Look pitch (radians), first-person only. */
  pitchRad: number;
  /** Alt held: horizontal look is head-yaw vs body; FP body peek pose may activate. */
  freeLookActive: boolean;
  /**
   * Client FP locomotion bob phase (radians). Advances while walking; use for stride-linked
   * viewmodel motion (arms, feet) without coupling to Three.js.
   */
  stridePhaseRad: number;
  velocity: Vec3;
  grounded: boolean;
  stance: PlayerStance;
  locomotion: LocomotionPresentation;
  /** Primary equipped item for presentation + animation sets. */
  equippedPrimary: HeldItemId;
  /** Monotonic counter: presentation fires melee visuals when this advances. */
  meleeAttackSeq: number;
  /** Monotonic counter: presentation fires ranged recoil / muzzle flash when this advances. */
  firearmShotSeq: number;
  primaryAction: PlayerPrimaryAction;
  life: PlayerLifePhase;
  animation: PlayerAnimationIntent;
};

/**
 * Remote players: replicated kinematics + presentation hints.
 * Built from net tables / snapshots, not read directly from SpaceTimeDB in render code.
 */
export type RemotePlayerGameplayState = {
  kind: "remote";
  playerIdHex: PlayerIdHex;
  position: Vec3;
  yawRad: number;
  velocity: Vec3;
  grounded: boolean;
  locomotion: LocomotionPresentation;
  equippedPrimary: HeldItemId;
  life: PlayerLifePhase;
  animation: PlayerAnimationIntent;
};

export type PlayerGameplayState = LocalPlayerGameplayState | RemotePlayerGameplayState;

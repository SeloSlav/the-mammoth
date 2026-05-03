import type { HeldItemId, PlayerIdHex } from "./ids.js";
import type { LocomotionPresentation } from "./stance.js";
import type { Vec3 } from "./gameplayState.js";

/**
 * Normalized replicated snapshot for render-side consumers (interpolated position allowed).
 * This is the boundary type between networking/subscriptions and `RemotePlayerPresenter`.
 */
export type ReplicatedPlayerSnapshot = {
  playerIdHex: PlayerIdHex;
  displayName: string;
  /** Client time when this snapshot was observed (for debugging / diagnostics). */
  observedTimeMs: number;
  worldPosition: Vec3;
  yawRad: number;
  velocity: Vec3;
  grounded: boolean;
  locomotion: LocomotionPresentation;
  equippedPrimary: HeldItemId;
  /** Advances on each authoritative `submit_melee_swing` that emits (server `player_pose.melee_presentation_seq`). */
  meleePresentationSeq: number;
  /** Advances on each accepted `submit_firearm_shot` (`player_pose.firearm_presentation_seq`). */
  firearmPresentationSeq: number;
};

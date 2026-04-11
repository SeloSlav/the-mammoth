import type { HeldItemId, PlayerIdHex } from "./ids.js";
import type { LocomotionPresentation } from "./stance.js";
import type { Vec3 } from "./gameplayState.js";

/**
 * Normalized replicated snapshot for render-side consumers (interpolated position allowed).
 * This is the boundary type between networking/subscriptions and `RemotePlayerPresenter`.
 */
export type ReplicatedPlayerSnapshot = {
  playerIdHex: PlayerIdHex;
  /** Client time when this snapshot was observed (for debugging / diagnostics). */
  observedTimeMs: number;
  worldPosition: Vec3;
  yawRad: number;
  velocity: Vec3;
  grounded: boolean;
  locomotion: LocomotionPresentation;
  equippedPrimary: HeldItemId;
};

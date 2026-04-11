import type { AnimationActionName } from "@the-mammoth/game";

/**
 * Desired high-level animation state for a frame — producers: gameplay/presentation.
 * Consumers: `IAnimationDriver` implementations (primitive curves, GLTF mixer, etc.).
 */
export type AnimationDriverDesiredState = {
  locomotion: AnimationActionName;
  overlay?: AnimationActionName;
};

/**
 * Animation backend boundary — presenters must not branch on concrete driver type.
 * TODO: add cross-fade weights, curve assets, mirrored attacks, weapon-specific sets.
 */
export interface IAnimationDriver {
  setDesired(desired: AnimationDriverDesiredState): void;
  /** One-shot actions (attacks, equips) — primitive driver uses timers; GLTF uses mixer events. */
  triggerTransient(action: AnimationActionName): void;
  update(dt: number): void;
  /** Normalized phase for procedural overlays (0 = start, 1 = end). */
  getTransientPhase01(action: AnimationActionName): number;
  dispose(): void;
}

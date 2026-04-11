import type { AnimationActionName, PlayerAnimationIntent } from "./animationIntent.js";
import type { LocomotionPresentation, PlayerStance } from "./stance.js";

function locomotionToAction(
  loco: LocomotionPresentation,
  stance: PlayerStance,
): AnimationActionName {
  if (stance === "crouch") {
    return loco === "idle" ? "crouch_idle" : "walk";
  }
  if (loco === "run") return "run";
  if (loco === "walk") return "walk";
  return "idle";
}

export function derivePlayerAnimationIntent(input: {
  locomotion: LocomotionPresentation;
  stance: PlayerStance;
  /** When true, locomotion action is overridden as an attack overlay for FP viewmodels. */
  meleeSwingActive: boolean;
  aimWeight01?: number;
}): PlayerAnimationIntent {
  const aimWeight01 = input.aimWeight01 ?? 0;
  return {
    locomotion: locomotionToAction(input.locomotion, input.stance),
    overlay: input.meleeSwingActive ? "attack_light" : undefined,
    aimWeight01,
  };
}

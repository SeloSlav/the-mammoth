/**
 * Presentation-facing animation requests (names stable across primitive + GLTF drivers).
 * TODO: expand with equip, inspect, damage staggers, full-body gestures.
 */
export type AnimationActionName =
  | "idle"
  | "walk"
  | "run"
  | "crouch_idle"
  | "attack_light"
  | "attack_heavy"
  | "equip"
  | "reload"
  | "aim"
  | "inspect"
  | "interact";

/**
 * What the player wants the animation graph to do this frame.
 * Controllers map gameplay -> intent; presenters/drivers consume intent.
 */
export type PlayerAnimationIntent = {
  /** Primary locomotion / stance clip suggestion for third-person. */
  locomotion: AnimationActionName;
  /** Upper-body / viewmodel overlay (first-person) or full-body for simple rigs. */
  overlay?: AnimationActionName;
  /** Normalized aim / look weight for future aim layers (0..1). */
  aimWeight01: number;
};

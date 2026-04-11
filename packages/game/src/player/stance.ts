/** Locomotion posture — presentation may map this to eye height, capsule, etc. */
export type PlayerStance = "stand" | "crouch";

/**
 * High-level locomotion phase derived from movement intent + velocity.
 * Presentation-only hint; simulation remains authoritative on transforms.
 */
export type LocomotionPresentation = "idle" | "walk" | "run";

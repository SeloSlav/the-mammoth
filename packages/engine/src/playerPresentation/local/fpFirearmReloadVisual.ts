import type { Vec3 } from "@the-mammoth/game";

/** Peak view-aligned knock (radians) per round seated. */
export const FP_FIREARM_RELOAD_PITCH_MAX_RAD = 0.38;
/** Peak upward kick along view up (meters) per round seated. */
export const FP_FIREARM_RELOAD_LIFT_MAX_M = 0.024;

/** Fraction of each round slice spent snapping upward (rest is settle back). */
export const FP_FIREARM_RELOAD_KNOCK_PEAK_FRAC = 0.2;

export type FpFirearmReloadVisualSample = {
  translationM: Vec3;
  rotationRad: Vec3;
};

function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

/** Quick upward knock then settle — reads better than a slow symmetric up/down on heavy rigs. */
export function knockWave01(u: number, peakFrac = FP_FIREARM_RELOAD_KNOCK_PEAK_FRAC): number {
  const x = clamp01(u);
  const peak = Math.max(0.08, Math.min(0.35, peakFrac));
  if (x <= peak) return x / peak;
  return Math.max(0, 1 - (x - peak) / (1 - peak));
}

/**
 * Per-round reload cue: equal slices; each slice snaps up then settles (not a slow float).
 * `progress01` spans the partial reload window (full mag time × rounds / capacity).
 */
export function sampleFpFirearmReloadVisual(
  progress01: number,
  roundsToLoad: number,
): FpFirearmReloadVisualSample {
  const rounds = Math.max(1, Math.floor(roundsToLoad));
  const t = clamp01(progress01);
  const sliceWidth = 1 / rounds;
  const sliceIndex = Math.min(rounds - 1, Math.floor(t / sliceWidth + 1e-9));
  const sliceStart = sliceIndex * sliceWidth;
  const localU = Math.min(1, (t - sliceStart) / sliceWidth);
  const wave = knockWave01(localU);

  const pitch = wave * FP_FIREARM_RELOAD_PITCH_MAX_RAD;
  const lift = wave * FP_FIREARM_RELOAD_LIFT_MAX_M;

  return {
    translationM: { x: 0, y: lift, z: 0 },
    rotationRad: { x: pitch, y: 0, z: 0 },
  };
}

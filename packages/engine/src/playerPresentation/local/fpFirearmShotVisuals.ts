import type { HeldItemId, Vec3 } from "@the-mammoth/game";

/** Keep in lockstep with `apps/server/src/hitscan.rs` (`RANGE_*`). */
export const FP_FIREARM_HITSCAN_RANGE_PISTOL_M = 48;
/** Keep in lockstep with `apps/server/src/hitscan.rs`. */
export const FP_FIREARM_HITSCAN_RANGE_SHOTGUN_M = 22;
/** Keep in lockstep with `apps/server/src/hitscan.rs` (`SHOTGUN_PELLET_COUNT`). */
export const FP_FIREARM_HITSCAN_SHOTGUN_PELLET_COUNT = 8;
/** Keep in lockstep with `apps/server/src/hitscan.rs` (`SHOTGUN_SPREAD_RAD`). */
export const FP_FIREARM_HITSCAN_SHOTGUN_SPREAD_RAD = 0.055;

export function fpFirearmHitscanRangeMForHeldItem(heldItemId: HeldItemId): number | null {
  if (heldItemId === "pistol") return FP_FIREARM_HITSCAN_RANGE_PISTOL_M;
  if (heldItemId === "shotgun-coach") return FP_FIREARM_HITSCAN_RANGE_SHOTGUN_M;
  return null;
}

export function fpFirearmHitscanPelletCountForHeldItem(heldItemId: HeldItemId): number {
  return heldItemId === "shotgun-coach" ? FP_FIREARM_HITSCAN_SHOTGUN_PELLET_COUNT : 1;
}

export type FpFirearmShotVisualConfig = {
  durationS: number;
  flashDurationS: number;
  kickBackM: number;
  liftM: number;
  pitchRad: number;
  yawRad: number;
  rollRad: number;
  flashScaleM: number;
  flashLocalPositionM: Vec3;
};

export type FpFirearmShotVisualSample = {
  translationM: Vec3;
  rotationRad: Vec3;
  flashAlpha: number;
  flashScaleM: number;
};

const ZERO_SAMPLE: FpFirearmShotVisualSample = {
  translationM: { x: 0, y: 0, z: 0 },
  rotationRad: { x: 0, y: 0, z: 0 },
  flashAlpha: 0,
  flashScaleM: 0,
};

const PISTOL_VISUAL: FpFirearmShotVisualConfig = {
  durationS: 0.18,
  flashDurationS: 0.055,
  kickBackM: 0.055,
  liftM: 0.018,
  pitchRad: 0.23,
  yawRad: -0.018,
  rollRad: -0.045,
  flashScaleM: 0.16,
  flashLocalPositionM: { x: 0.17, y: -0.105, z: -0.68 },
};

const SHOTGUN_VISUAL: FpFirearmShotVisualConfig = {
  durationS: 0.28,
  flashDurationS: 0.075,
  kickBackM: 0.105,
  liftM: 0.03,
  pitchRad: 0.38,
  yawRad: -0.028,
  rollRad: -0.075,
  flashScaleM: 0.28,
  flashLocalPositionM: { x: 0.11, y: -0.075, z: -0.86 },
};

export function fpFirearmShotVisualConfigForHeldItem(
  heldItemId: HeldItemId,
): FpFirearmShotVisualConfig | null {
  if (heldItemId === "pistol") return PISTOL_VISUAL;
  if (heldItemId === "shotgun-coach") return SHOTGUN_VISUAL;
  return null;
}

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

export function sampleFpFirearmShotVisual(
  config: FpFirearmShotVisualConfig,
  elapsedS: number,
): FpFirearmShotVisualSample {
  if (elapsedS < 0 || elapsedS >= config.durationS) return ZERO_SAMPLE;

  const u = clamp01(elapsedS / config.durationS);
  const kick = Math.sin((1 - easeOutCubic(u)) * Math.PI * 0.5);
  const settle = Math.sin(u * Math.PI);
  const flashU = clamp01(elapsedS / config.flashDurationS);
  const flashAlpha = flashU >= 1 ? 0 : (1 - flashU) * (1 - flashU);

  return {
    translationM: {
      x: -0.012 * settle,
      y: config.liftM * kick,
      z: config.kickBackM * kick,
    },
    rotationRad: {
      x: config.pitchRad * kick,
      y: config.yawRad * settle,
      z: config.rollRad * kick,
    },
    flashAlpha,
    flashScaleM: config.flashScaleM * (0.82 + 0.38 * (1 - flashU)),
  };
}

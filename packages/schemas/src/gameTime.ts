/**
 * In-game day/time + fatigue constants — keep in sync with `apps/server/src/game_time.rs`.
 */

/** Minutes since 00:00 for default morning wake. */
export const WAKE_TIME_MINUTES = 360 as const; // 06:00

/** Soft fatigue begins (21:00 same calendar day). */
export const SOFT_FATIGUE_START_MINUTES = 1260 as const;

/** Voluntary sleep after this is normal quality, not good (23:00). */
export const NORMAL_SLEEP_START_MINUTES = 1380 as const;

/** After-midnight zone uses minutes < WAKE_TIME; severe fatigue from midnight. */
export const SEVERE_FATIGUE_START_MINUTES = 0 as const;

/** Escalating collapse pressure (02:00 after midnight). */
export const NORMAL_COLLAPSE_PRESSURE_MINUTES = 120 as const;

/** Absolute playable cap (03:30 after midnight). */
export const HARD_COLLAPSE_TIME_MINUTES = 210 as const;

/** 1 real second = 30 in-game seconds → 2 real minutes = 1 in-game hour. */
export const GAME_SECONDS_PER_REAL_SECOND = 30 as const;

/** Game minutes gained per real second at 1× pacing. */
export const GAME_MINUTES_PER_REAL_SECOND = GAME_SECONDS_PER_REAL_SECOND / 60;

/** @deprecated Use {@link GAME_SECONDS_PER_REAL_SECOND}. */
export const REAL_SECS_PER_GAME_SECS = 1 / GAME_SECONDS_PER_REAL_SECOND;

/** Server game-time scheduler cadence (wall seconds). */
export const GAME_TIME_TICK_INTERVAL_SECS = 1 as const;

/** Game minutes advanced per server tick. */
export const GAME_MINUTES_PER_TICK = GAME_TIME_TICK_INTERVAL_SECS * GAME_MINUTES_PER_REAL_SECOND;

/** Extra hunger/hydration drain multiplier while sprinting (on top of base). */
export const SPRINT_VITALS_DRAIN_MUL = 1.15 as const;

/** Base vitals drain multiplier by fatigue tier. */
export const FATIGUE_VITALS_DRAIN_MUL_NONE = 1.0 as const;
export const FATIGUE_VITALS_DRAIN_MUL_SOFT = 1.15 as const;
export const FATIGUE_VITALS_DRAIN_MUL_SEVERE = 1.35 as const;
export const FATIGUE_VITALS_DRAIN_MUL_COLLAPSE = 1.5 as const;

/** Client sprint speed multiplier by fatigue tier (sprint never disabled). */
export const FATIGUE_SPRINT_SPEED_MUL_NONE = 1.0 as const;
export const FATIGUE_SPRINT_SPEED_MUL_SOFT = 0.95 as const;
export const FATIGUE_SPRINT_SPEED_MUL_SEVERE = 0.88 as const;
export const FATIGUE_SPRINT_SPEED_MUL_COLLAPSE = 0.8 as const;

export type FatigueTier = "none" | "soft" | "severe" | "collapse";

/** True when `minutes` is in the after-midnight window (00:00–06:00). */
export function isAfterMidnight(minutes: number): boolean {
  return minutes < WAKE_TIME_MINUTES;
}

/** Format minutes since 00:00 as 24h HH:MM. */
export function formatGameTimeHhMm(minutes: number): string {
  const m = Math.max(0, Math.min(1439, Math.floor(minutes)));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Display day number from nights slept counter. */
export function displayDayNumber(sleepsCount: number): number {
  return sleepsCount + 1;
}

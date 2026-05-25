import {
  FATIGUE_SPRINT_SPEED_MUL_COLLAPSE,
  FATIGUE_SPRINT_SPEED_MUL_NONE,
  FATIGUE_SPRINT_SPEED_MUL_SEVERE,
  FATIGUE_SPRINT_SPEED_MUL_SOFT,
  HARD_COLLAPSE_TIME_MINUTES,
  isAfterMidnight,
  SOFT_FATIGUE_START_MINUTES,
  type FatigueTier,
  WAKE_TIME_MINUTES,
} from "@the-mammoth/schemas";

export type { FatigueTier };

export type GameTimeProgressSnapshot = {
  timeOfDayMinutes: number;
  sleepPressure: number;
  stimulantLoad: number;
};
export function deriveFatigueTier(snapshot: GameTimeProgressSnapshot): FatigueTier {
  const { timeOfDayMinutes, sleepPressure, stimulantLoad } = snapshot;

  let raw: FatigueTier = "none";
  if (isAfterMidnight(timeOfDayMinutes)) {
    raw = timeOfDayMinutes >= HARD_COLLAPSE_TIME_MINUTES - 30 ? "collapse" : "severe";
  } else if (timeOfDayMinutes >= SOFT_FATIGUE_START_MINUTES) {
    raw = "soft";
  }

  if (stimulantLoad >= 0.2) {
    switch (raw) {
      case "collapse":
        return "severe";
      case "severe":
        return "soft";
      case "soft":
        return "none";
      default:
        return "none";
    }
  }

  if (sleepPressure > 0.85 && raw === "none") {
    return "soft";
  }

  return raw;
}

/** Sprint speed multiplier — sprint input never blocked. */
export function fatigueSprintSpeedMul(tier: FatigueTier): number {
  switch (tier) {
    case "none":
      return FATIGUE_SPRINT_SPEED_MUL_NONE;
    case "soft":
      return FATIGUE_SPRINT_SPEED_MUL_SOFT;
    case "severe":
      return FATIGUE_SPRINT_SPEED_MUL_SEVERE;
    case "collapse":
      return FATIGUE_SPRINT_SPEED_MUL_COLLAPSE;
  }
}

export function deriveFatigueSprintSpeedMul(snapshot: GameTimeProgressSnapshot): number {
  return fatigueSprintSpeedMul(deriveFatigueTier(snapshot));
}

/** Near-collapse warning threshold for HUD feedback. */
export function shouldShowFatigueWarning(snapshot: GameTimeProgressSnapshot): boolean {
  const tier = deriveFatigueTier(snapshot);
  if (tier === "collapse") return true;
  return isAfterMidnight(snapshot.timeOfDayMinutes) && snapshot.timeOfDayMinutes >= 90;
}

export { WAKE_TIME_MINUTES };

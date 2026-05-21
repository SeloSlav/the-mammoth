/**
 * Balcony grow-op gameplay constants — keep in sync with `apps/server/src/balcony_grow_op.rs`.
 */

export const BALCONY_GROW_TRAY_COUNT = 8 as const;
export const BALCONY_GROW_SLOTS_PER_TRAY = 4 as const;
export const BALCONY_GROW_TRAY_MAX_WATER_L = 2.0;
export const BALCONY_GROW_LIGHT_BONUS = 0.15;
export const BALCONY_GROW_FERTILIZER_BONUS = 0.2;
export const BALCONY_GROW_WATER_BONUS_PER_HALF_L = 0.1;
export const BALCONY_WATER_PATCH_RADIUS_M = 0.55;
export const BALCONY_WATER_PATCH_DUMP_L = 0.35;
export const BALCONY_WATER_PATCH_DURATION_SECS = 45;
export const BALCONY_GAME_DAY_SECS = 180;
export const BALCONY_GROW_WILT_TICKS_WITHOUT_WATER = 6;
export const BALCONY_GROW_TICK_INTERVAL_SECS = 5;
export const BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK = 0.04;

/** 2×2 snap offsets in tray local space (meters). */
export const BALCONY_GROW_SLOT_LOCAL_OFFSETS: readonly { x: number; z: number }[] = [
  { x: -0.11, z: -0.11 },
  { x: 0.11, z: -0.11 },
  { x: -0.11, z: 0.11 },
  { x: 0.11, z: 0.11 },
];

export const APARTMENT_STASH_KIND_GROW_TRAY = "grow_tray" as const;

export const BALCONY_GROW_FERTILIZER_DEF_ID = "balcony-grow-substrate" as const;

/** Stable builtin tray UUIDs from `owned_apartment_builtins.json` (sorted by fz, fx). */
export const BALCONY_GROW_TRAY_BUILTIN_IDS: readonly string[] = [
  "8e48c06b-c005-4425-9fdc-a527e67168ee",
  "825bca36-e9b8-4fa7-9883-2d57ba0ebe04",
  "5a8db793-b6e6-4266-bd96-8d53a1452e91",
  "74e853d2-62cb-42b3-b740-c8ea51c6179f",
  "8cf090f7-acfa-460d-8360-f8c48a233557",
  "74725d62-5270-4d8f-a1fe-4e08f9215e0d",
  "f7b5698a-e331-48bf-b5f2-aab0002b037d",
  "8b770390-544f-4a40-aaa3-ec34d9ed66a7",
] as const;

/** Layout fractions from `owned_apartment_builtins.json` grow-tray rows (by tray id). */
export const BALCONY_GROW_TRAY_AUTHORED_FX_FZ: Readonly<
  Record<string, { fx: number; fz: number }>
> = {
  "8e48c06b-c005-4425-9fdc-a527e67168ee": { fx: 0.8433852563352113, fz: -0.026789220468649344 },
  "825bca36-e9b8-4fa7-9883-2d57ba0ebe04": { fx: 0.9273651377782285, fz: -0.026789220468649344 },
  "5a8db793-b6e6-4266-bd96-8d53a1452e91": { fx: 0.8433852563352113, fz: 0.09540147283815242 },
  "74e853d2-62cb-42b3-b740-c8ea51c6179f": { fx: 0.9273651377782282, fz: 0.09540147283815242 },
  "8cf090f7-acfa-460d-8360-f8c48a233557": { fx: 0.8433852563352113, fz: 0.21759216614495205 },
  "74725d62-5270-4d8f-a1fe-4e08f9215e0d": { fx: 0.9273651377782273, fz: 0.21759216614495205 },
  "f7b5698a-e331-48bf-b5f2-aab0002b037d": { fx: 0.9273651377782269, fz: 0.3397828594517517 },
  "8b770390-544f-4a40-aaa3-ec34d9ed66a7": { fx: 0.8433852563352113, fz: 0.3397828594517517 },
};

/** Horizontal interact radius for grow-tray stash / plant / harvest. */
export const BALCONY_GROW_TRAY_INTERACT_RADIUS_M = 4 as const;

export type BalconyGrowStage = "seed" | "sapling" | "mid" | "mature";

export function balconyGrowTrayStashKey(unitKey: string, trayId: string): string {
  return `${unitKey}#grow_tray:${trayId}`;
}

export function parseBalconyGrowTrayStashKey(
  stashKey: string,
): { unitKey: string; trayId: string } | null {
  const sep = stashKey.lastIndexOf("#");
  if (sep <= 0) return null;
  const tail = stashKey.slice(sep + 1);
  const prefix = "grow_tray:";
  if (!tail.startsWith(prefix)) return null;
  const trayId = tail.slice(prefix.length);
  if (!trayId) return null;
  return { unitKey: stashKey.slice(0, sep), trayId };
}

/** Growth speed modifier from tray conditions (≥ 1.0 base). */
export function balconyGrowSpeedModifier(opts: {
  lightsOn: boolean;
  fertilizerPresent: boolean;
  waterLiters: number;
}): number {
  let m = 1.0;
  if (opts.lightsOn) m += BALCONY_GROW_LIGHT_BONUS;
  if (opts.fertilizerPresent) m += BALCONY_GROW_FERTILIZER_BONUS;
  const waterSteps = Math.floor(Math.min(opts.waterLiters, BALCONY_GROW_TRAY_MAX_WATER_L) / 0.5);
  m += waterSteps * BALCONY_GROW_WATER_BONUS_PER_HALF_L;
  return m;
}

export function balconyGrowStageFromProgress(progress: number): BalconyGrowStage {
  if (progress >= 1) return "mature";
  if (progress >= 0.66) return "mid";
  if (progress >= 0.2) return "sapling";
  return "seed";
}

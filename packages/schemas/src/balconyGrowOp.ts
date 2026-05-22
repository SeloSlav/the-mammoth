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
/** Wet-shadow visual lifetime — fades before the next tending pass. */
export const BALCONY_WATER_PATCH_DURATION_SECS = 45;
/** Session baseline: ~15 min seed→mature at 1.0× for a 5-day catalog crop (sim time only). */
export const BALCONY_GROW_BASELINE_DURATION_SECS = 900;
/** Catalog grow-days that map to {@link BALCONY_GROW_BASELINE_DURATION_SECS} at 1.0×. */
export const BALCONY_GROW_REFERENCE_DAYS = 5;
/** Seconds per in-game grow day — keep in sync with `apps/server/src/balcony_grow_op.rs`. */
export const BALCONY_GAME_DAY_SECS =
  BALCONY_GROW_BASELINE_DURATION_SECS / BALCONY_GROW_REFERENCE_DAYS;
export const BALCONY_GROW_WILT_TICKS_WITHOUT_WATER = 8;
export const BALCONY_GROW_TICK_INTERVAL_SECS = 5;
/** Tray evaporation per 5s tick — ~4 min from full to dry at session crop pacing. */
export const BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK = 0.042;
/** Single substrate stack slot in each grow-tray stash. */
export const BALCONY_GROW_FERTILIZER_STASH_SLOT = 0;

export type BalconyGrowStage = "seed" | "sapling" | "mid" | "mature";

/** 2×2 snap offsets in tray local space (meters) — fallback when tray bounds probe unavailable. */
export const BALCONY_GROW_SLOT_LOCAL_OFFSETS: readonly { x: number; z: number }[] = [
  { x: -0.22, z: -0.22 },
  { x: 0.22, z: -0.22 },
  { x: -0.22, z: 0.22 },
  { x: 0.22, z: 0.22 },
];

/**
 * Slot centers sit at this fraction of the (inset) soil half-extent from the tray center —
 * 0.78 ≈ spread toward the rim without clipping the frame.
 */
export const BALCONY_GROW_SLOT_EDGE_FRAC = 0.78 as const;

/** Inset applied to probed tray bounds before slot layout (excludes outer rim/frame). */
export const BALCONY_GROW_SLOT_SOIL_INSET_FRAC = 0.14 as const;

export type BalconyGrowSlotXZ = { x: number; z: number };

/** Four quadrant centers from soil half-extents in tray-local space. */
export function balconyGrowSlotOffsetsFromHalfExtents(
  halfX: number,
  halfZ: number,
  centerX = 0,
  centerZ = 0,
  edgeFrac = BALCONY_GROW_SLOT_EDGE_FRAC,
): BalconyGrowSlotXZ[] {
  const dx = halfX * edgeFrac;
  const dz = halfZ * edgeFrac;
  return [
    { x: centerX - dx, z: centerZ - dz },
    { x: centerX + dx, z: centerZ - dz },
    { x: centerX - dx, z: centerZ + dz },
    { x: centerX + dx, z: centerZ + dz },
  ];
}

export function balconyGrowSlotLocalPosition(
  slotIndex: number,
  soilLocalY = BALCONY_GROW_SOIL_LOCAL_Y,
  slotOffsets: readonly BalconyGrowSlotXZ[] = BALCONY_GROW_SLOT_LOCAL_OFFSETS,
): { x: number; y: number; z: number } {
  const off = slotOffsets[slotIndex];
  if (!off) return { x: 0, y: soilLocalY, z: 0 };
  return { x: off.x, y: soilLocalY, z: off.z };
}

/** Fallback tray-local soil surface Y when bounds probe is unavailable (after decor centering). */
export const BALCONY_GROW_SOIL_LOCAL_Y = 0.042;

/** Base visual scale per growth stage in a tray slot (before crop `stageScale`). */
export const BALCONY_GROW_STAGE_BASE_SCALE: Readonly<Record<BalconyGrowStage, number>> = {
  seed: 0.14,
  sapling: 0.2,
  mid: 0.28,
  mature: 0.34,
};

export function balconyGrowStageVisualScale(
  stage: BalconyGrowStage,
  cropStageScale = 1,
): number {
  const base = BALCONY_GROW_STAGE_BASE_SCALE[stage];
  return base * (cropStageScale > 0 ? cropStageScale : 1);
}

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

/** Horizontal interact radius (m) — balcony trays: allow lean-in harvest from typical standing positions. Keep in sync with `TRAY_INTERACT_RADIUS_M` in `apps/server/src/balcony_grow_op.rs`. */
export const BALCONY_GROW_TRAY_INTERACT_RADIUS_M = 1.75 as const;

export const BALCONY_GROW_TRAY_STASH_PROXIMITY_HINT =
  "Move closer to the grow tray to use its storage." as const;

/** Show balcony tray decor / plants while the player is on the balcony (outside strict unit hull). */
export const BALCONY_GROW_TRAY_PRESENTATION_RADIUS_M = 2.75 as const;

export function balconyGrowTrayStashKey(unitKey: string, trayId: string): string {
  return `${unitKey}#grow_tray:${trayId}`;
}

export const BALCONY_GROW_DECOR_TRAY_ID_PREFIX = "decor:" as const;

export function balconyGrowDecorTrayId(decorId: bigint | number | string): string {
  return `${BALCONY_GROW_DECOR_TRAY_ID_PREFIX}${decorId.toString()}`;
}

export function parseBalconyGrowDecorTrayId(trayId: string): bigint | null {
  if (!trayId.startsWith(BALCONY_GROW_DECOR_TRAY_ID_PREFIX)) return null;
  const text = trayId.slice(BALCONY_GROW_DECOR_TRAY_ID_PREFIX.length);
  if (!/^\d+$/.test(text)) return null;
  return BigInt(text);
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
  if (progress > 0) return "sapling";
  return "seed";
}

/** Seconds for a full tray to evaporate dry (sim time only — pauses when the game closes). */
export function balconyGrowTraySecondsToDry(
  waterLiters = BALCONY_GROW_TRAY_MAX_WATER_L,
): number {
  if (BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK <= 0) return Number.POSITIVE_INFINITY;
  const ticks = waterLiters / BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK;
  return ticks * BALCONY_GROW_TICK_INTERVAL_SECS;
}

/** Expected grow duration (seconds) for catalog `growDays` at 1.0× with no tray bonuses. */
export function balconyGrowCropSecondsAtBaseSpeed(growDays: number): number {
  return growDays * BALCONY_GAME_DAY_SECS;
}

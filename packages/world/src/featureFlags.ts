/**
 * Default toggles for world rendering / optional authoring paths (@the-mammoth/world).
 *
 * Prefer editing here rather than scattering `ENABLE_*` / PBR knobs across modules.
 */

/**
 * Initial value for {@link authorImportedPbrTexturesState.enabled}.
 * When `false`, skips loading author basecolor/normal/roughness/AO/opt-in maps (FPS profiling).
 */
export const AUTHOR_IMPORTED_PBR_TEXTURES_DEFAULT_ENABLED = true;

/** When `true`, drops normal maps from merged floor shell PBR (saves texture fetches). */
export const FLOOR_SHELL_DISABLE_NORMAL_MAPS = false;

/** Stairwell kit: decorative props adjacent to heater stubs on landings. */
export const ENABLE_STAIRWELL_HEATER_LANDING_PROPS = true;

/** Stairwell kit: mixed litter near landings / treads (cigarettes, packs, bottles, cans). */
export const ENABLE_STAIRWELL_HEATER_CIGARETTE_LITTER = true;

/**
 * Stairwell graffiti decals on client (projected meshes + decal textures).
 * When `false`, the FP session skips loading decal assets entirely (no texture fetches).
 */
export const ENABLE_STAIRWELL_GRAFFITI_DECALS = false;

/**
 * Exterior megablock yard trees (procedural via `@dgreenheck/ez-tree`, merged per species).
 * When `false`, FP skips grove mesh build + client tree collision pillars (toggle here for perf).
 */
export const ENABLE_EXTERIOR_PROCEDURAL_TREES = true;

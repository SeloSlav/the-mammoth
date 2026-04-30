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
export let ENABLE_STAIRWELL_HEATER_LANDING_PROPS = false;

/** Stairwell kit: stray cigarette meshes near heaters (content experiment). */
export let ENABLE_STAIRWELL_HEATER_CIGARETTE_LITTER = false;

/**
 * Stairwell graffiti decals on client (projected meshes + decal textures).
 * When `false`, the FP session skips loading decal assets entirely (no texture fetches).
 */
export let ENABLE_STAIRWELL_GRAFFITI_DECALS = false;

/**
 * Client-side procedural L-system tree grove around the exterior megablock yard.
 * Defaults on, but can be disabled here for profiling or art-direction passes.
 */
export let ENABLE_EXTERIOR_PROCEDURAL_TREES = true;

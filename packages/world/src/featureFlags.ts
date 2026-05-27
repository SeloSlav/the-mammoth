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
export const ENABLE_STAIRWELL_HEATER_LANDING_PROPS = false;

/** Stairwell kit: mixed litter near landings / treads (cigarettes, packs, bottles, cans). */
export const ENABLE_STAIRWELL_HEATER_CIGARETTE_LITTER = false;

/**
 * Stairwell graffiti decals on client (projected meshes + decal textures).
 * When `false`, the FP session skips loading decal assets entirely (no texture fetches).
 */
export const ENABLE_STAIRWELL_GRAFFITI_DECALS = false;

/**
 * Floor-19 corridor flush ceiling fixtures — emissive bulb glow only (never runtime SpotLights).
 * See {@link ENABLE_RUNTIME_CORRIDOR_FIXTURE_PRACTICAL_LIGHTS}.
 */
export const ENABLE_CORRIDOR_CEILING_LIGHTS = true;

/**
 * Stairwell flush ceiling fixtures (world mount). Off while perf is tuned; corridor uses
 * {@link ENABLE_CORRIDOR_CEILING_LIGHTS} separately.
 */
export const ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS = false;

/**
 * Corridor ceiling mounts are emissive-only — always `false` until a cheap shared-space path exists.
 * Stairwell practicals use {@link ENABLE_RUNTIME_SHARED_STATIC_FIXTURE_PRACTICAL_LIGHTS}.
 */
export const ENABLE_RUNTIME_CORRIDOR_FIXTURE_PRACTICAL_LIGHTS = false;

/**
 * Runtime SpotLights for gameplay/mood screens (TV, computer). Small count, no shadows.
 */
export const ENABLE_RUNTIME_DYNAMIC_DECOR_LIGHTS = true;

/**
 * Soft window fill spots for the **current apartment unit only** (max 6, no shadows).
 * Emissive alone cannot replace this — keep on until window bounce is authored another way.
 */
export const ENABLE_RUNTIME_WINDOW_FILL_LIGHTS = true;

/**
 * Per-fixture practical pools inside the player's apartment unit (ceiling, chandelier,
 * standing, grow-op).
 */
export const ENABLE_RUNTIME_APARTMENT_STATIC_FIXTURE_LIGHTS = true;

/**
 * Per-fixture practical pools for corridor + stairwell ceiling mounts (building-wide, expensive).
 * Off until lightmaps/emissive-only path is authored for shared spaces.
 */
export const ENABLE_RUNTIME_SHARED_STATIC_FIXTURE_PRACTICAL_LIGHTS = false;

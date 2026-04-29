/**
 * Replicated melee swing (`world_sound_event` kind `MELEE_WEAPON_SWING` = 1): `variation` packs a
 * **sound profile** (per-weapon stem set) and a **stem index** (alternation). Keep encoding in
 * sync with `apps/server/src/world_sound.rs`.
 */

const AUDIO_ROOT = `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;
const UI_STEM = `${AUDIO_ROOT}/ui`;

/** Low bits of `variation` — stem index (currently 0–1 for A/B whoosh). */
export const MELEE_SWING_VARIATION_STEM_MASK = 0b11;
/** Upper bits = profile id (0–63). */
export const MELEE_SWING_VARIATION_PROFILE_SHIFT = 2;

/** Default profile: generic melee whoosh (falls back to legacy crowbar stems if missing). */
export const MELEE_WEAPON_SWING_SOUND_PROFILE_DEFAULT = 0;

/**
 * Catalog `def_id` → sound profile. Override when a weapon ships its own stems under
 * `weapon-melee-swing-p{N}.wav` (+ `-2`); see {@link MELEE_WEAPON_SWING_DEFAULT_STEM_GROUPS}.
 */
export function meleeWeaponSwingSoundProfileFromDefId(defId: string): number {
  switch (defId) {
    // Example: return 1 when `weapon-melee-swing-p1.wav` exists.
    default:
      return MELEE_WEAPON_SWING_SOUND_PROFILE_DEFAULT;
  }
}

export function meleeSwingStemIndexFromVariation(variation: number): number {
  return variation & MELEE_SWING_VARIATION_STEM_MASK;
}

export function meleeSwingProfileFromVariation(variation: number): number {
  return (variation >> MELEE_SWING_VARIATION_PROFILE_SHIFT) & 0x3f;
}

/** Stem groups for profile 0 — first group where every URL resolves wins. */
export const MELEE_WEAPON_SWING_DEFAULT_STEM_GROUPS: readonly (readonly [string, string])[] = [
  [`${UI_STEM}/weapon-melee-swing`, `${UI_STEM}/weapon-melee-swing-2`],
  [`${UI_STEM}/weapon-crowbar-swing`, `${UI_STEM}/weapon-crowbar-swing-2`],
];

/** Optional override profiles: `weapon-melee-swing-p{id}.wav` + `weapon-melee-swing-p{id}-2.wav`. */
export function meleeWeaponSwingOverrideStemPair(profileId: number): readonly [string, string] | null {
  if (profileId <= 0) return null;
  return [`${UI_STEM}/weapon-melee-swing-p${profileId}`, `${UI_STEM}/weapon-melee-swing-p${profileId}-2`];
}

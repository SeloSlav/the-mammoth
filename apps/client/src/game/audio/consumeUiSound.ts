/**
 * Hotbar instant-consume UI one-shots (`consume-eat` / `consume-drink` / `consume-smoke` under `public/audio/ui/`).
 * Prefer MP3 first for eat/drink so authored clips (e.g. `eating_food.mp3` / `drinking_water.mp3`) win over wav placeholders.
 *
 * **Smoke** prefers **WAV first**: the shipped SFX is `consume-smoke.wav`, and probing a missing `.mp3`
 * first can get a bogus `200` (e.g. HTML shell) on some hosts — decode then fails and the client fell
 * back to the eat stem (often perceived as a drink gulp).
 */

const AUDIO_ROOT = `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;
const UI_STEM = `${AUDIO_ROOT}/ui`;

export const CONSUME_EAT_STEM = `${UI_STEM}/consume-eat` as const;
export const CONSUME_DRINK_STEM = `${UI_STEM}/consume-drink` as const;
export const CONSUME_SMOKE_STEM = `${UI_STEM}/consume-smoke` as const;

export const CONSUME_STEM_MEDIA_EXTENSIONS = ["mp3", "ogg", "wav"] as const;
/** Authoritative clip is WAV; see module comment — do not reuse eat/drink probe order here. */
export const CONSUME_SMOKE_MEDIA_EXTENSIONS = ["wav", "mp3", "ogg"] as const;

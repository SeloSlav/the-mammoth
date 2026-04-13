/**
 * Hotbar instant-consume UI one-shots (`consume-eat` / `consume-drink` under `public/audio/ui/`).
 * Prefer MP3 first so authored clips (e.g. `eating_food.mp3` / `drinking_water.mp3`) win over wav placeholders.
 */

const AUDIO_ROOT = `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;
const UI_STEM = `${AUDIO_ROOT}/ui`;

export const CONSUME_EAT_STEM = `${UI_STEM}/consume-eat` as const;
export const CONSUME_DRINK_STEM = `${UI_STEM}/consume-drink` as const;

export const CONSUME_STEM_MEDIA_EXTENSIONS = ["mp3", "ogg", "wav"] as const;

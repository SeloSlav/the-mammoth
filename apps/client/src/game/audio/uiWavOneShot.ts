/**
 * Immediate UI one-shots via `HTMLAudioElement` — works on pointer gestures without Web Audio unlock.
 * Assets live under `apps/client/public/audio/ui/`.
 */

const AUDIO_ROOT = `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;
const UI_STEM = `${AUDIO_ROOT}/ui`;

export function playUiWavOneShot(filename: string, volume = 0.85): void {
  try {
    const audio = new Audio(`${UI_STEM}/${filename}`);
    audio.volume = volume;
    void audio.play().catch(() => {
      /* ignore autoplay policy during dev */
    });
  } catch {
    /* ignore */
  }
}

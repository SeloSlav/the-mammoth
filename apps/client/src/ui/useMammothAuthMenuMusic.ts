import { useEffect } from "react";

/** Served from `apps/client/public/audio/menu/mamutica-me-pojela.mp3`. */
export const MAMMOTH_AUTH_MENU_MUSIC_PUBLIC_PATH = "/audio/menu/mamutica-me-pojela.mp3" as const;

/** Looped backdrop for LoginGate / auth screens behind the Mammoth tower canvas. Stops on unmount. */
export function useMammothAuthMenuMusic(): void {
  useEffect(() => {
    const audio = new Audio(MAMMOTH_AUTH_MENU_MUSIC_PUBLIC_PATH);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.38;

    const tryPlay = (): void => {
      if (!audio.paused) return;
      void audio.play().catch(() => {
        /* Autoplay blocked until a gesture — pointer listener below retries. */
      });
    };

    tryPlay();

    window.addEventListener("pointerdown", tryPlay);
    window.addEventListener("keydown", tryPlay);

    return () => {
      window.removeEventListener("pointerdown", tryPlay);
      window.removeEventListener("keydown", tryPlay);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, []);
}

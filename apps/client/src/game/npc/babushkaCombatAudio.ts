/** Cached combat one-shots — decode once, play many (avoid hit-stutter from per-hit fetch/decode). */

const BABUSHKA_COMBAT_URLS = {
  aggro: "/audio/npc/babushka-aggro.wav",
  hit: "/audio/npc/babushka-hit.wav",
  punch: "/audio/npc/babushka-punch.wav",
  die: "/audio/npc/babushka-die.wav",
} as const;

export type BabushkaCombatClip = keyof typeof BABUSHKA_COMBAT_URLS;

export type BabushkaCombatAudio = {
  ensureLoaded: (ctx: AudioContext) => Promise<void>;
  play: (
    ctx: AudioContext,
    clip: BabushkaCombatClip,
    volume?: number,
    onEnded?: () => void,
  ) => void;
};

async function decodeUrl(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return await ctx.decodeAudioData(ab.slice(0));
  } catch {
    return null;
  }
}

export function createBabushkaCombatAudio(): BabushkaCombatAudio {
  const buffers = new Map<BabushkaCombatClip, AudioBuffer>();
  let boundCtx: AudioContext | null = null;
  let loadPromise: Promise<void> | null = null;

  const ensureLoaded = async (ctx: AudioContext): Promise<void> => {
    if (loadPromise && boundCtx === ctx) {
      await loadPromise;
      return;
    }
    boundCtx = ctx;
    loadPromise = (async () => {
      const entries = Object.entries(BABUSHKA_COMBAT_URLS) as [BabushkaCombatClip, string][];
      await Promise.all(
        entries.map(async ([clip, url]) => {
          const buf = await decodeUrl(ctx, url);
          if (buf) buffers.set(clip, buf);
        }),
      );
    })();
    await loadPromise;
  };

  const play = (
    ctx: AudioContext,
    clip: BabushkaCombatClip,
    volume = 0.85,
    onEnded?: () => void,
  ): void => {
    const buf = buffers.get(clip);
    if (!buf) {
      void ensureLoaded(ctx).then(() => play(ctx, clip, volume, onEnded));
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (onEnded) {
      src.onended = onEnded;
    }
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  };

  return { ensureLoaded, play };
};

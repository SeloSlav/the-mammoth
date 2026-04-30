/**
 * In-game sound bed: quiet always-on building ambience loops underneath soft, randomized music
 * chunks plus distant neighbor/building one-shots. The HUD switch only controls the music chunks;
 * ambience and random one-shots remain part of the world sound bed once audio is primed.
 */

const AUDIO_ROOT = `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;
const MUSIC_URL = `${AUDIO_ROOT}/music/concrete-creak.mp3` as const;
const AMBIENCE_ROOT = `${AUDIO_ROOT}/ambience` as const;
const RANDOM_ROOT = `${AMBIENCE_ROOT}/random` as const;

const OUT_GAIN = 1;
const MUSIC_BUS_GAIN = 0.22;
const AMBIENCE_BUS_GAIN = 1.15;
const RANDOM_BUS_GAIN = 1.35;
const USER_FADE_SECONDS = 1.6;
const AMBIENCE_FADE_SECONDS = 5.5;
const CHUNK_FADE_SECONDS = 4.5;
const CHUNK_MIN_SECONDS = 42;
const CHUNK_MAX_SECONDS = 92;
const SILENCE_CHANCE = 0.42;
const SILENCE_MIN_SECONDS = 9;
const SILENCE_MAX_SECONDS = 34;
const SHORT_BREATH_MIN_SECONDS = 0.8;
const SHORT_BREATH_MAX_SECONDS = 4.8;
const RANDOM_FIRST_MIN_SECONDS = 12;
const RANDOM_FIRST_MAX_SECONDS = 28;
const RANDOM_NEXT_MIN_SECONDS = 18;
const RANDOM_NEXT_MAX_SECONDS = 52;
const RANDOM_MAX_ACTIVE = 2;
const RANDOM_REF_DISTANCE_M = 7.5;
const RANDOM_MAX_DISTANCE_M = 85;
const RANDOM_ROLLOFF = 0.42;

type Vec3Like = {
  x: number;
  y: number;
  z: number;
};

type ActiveMusicChunk = {
  src: AudioBufferSourceNode;
  gain: GainNode;
};

type AmbienceLayerSpec = {
  name: string;
  url: string;
  gain: number;
  playbackRate: number;
  highpassHz?: number;
  lowpassHz?: number;
};

type AmbienceLayer = AmbienceLayerSpec & {
  buffer: AudioBuffer;
};

type ActiveAmbienceLoop = {
  src: AudioBufferSourceNode;
  gain: GainNode;
  nodes: AudioNode[];
};

type RandomSoundSpec = {
  name: string;
  urls: readonly string[];
  weight: number;
  gain: number;
  minDistanceM: number;
  maxDistanceM: number;
  yMinM: number;
  yMaxM: number;
  highpassHz?: number;
  lowpassHz: number;
  playbackRateJitter: number;
};

type RandomSound = RandomSoundSpec & {
  buffers: AudioBuffer[];
};

type ActiveRandomSound = {
  src: AudioBufferSourceNode;
  gain: GainNode;
  nodes: AudioNode[];
};

const AMBIENCE_LAYERS: readonly AmbienceLayerSpec[] = [
  {
    name: "building-breath",
    url: `${AMBIENCE_ROOT}/building-breath.wav`,
    gain: 0.42,
    playbackRate: 0.985,
    highpassHz: 24,
    lowpassHz: 820,
  },
  {
    name: "distant-city-veil",
    url: `${AMBIENCE_ROOT}/distant-city-veil.wav`,
    gain: 0.28,
    playbackRate: 1.0,
    highpassHz: 70,
    lowpassHz: 1900,
  },
  {
    name: "corridor-life",
    url: `${AMBIENCE_ROOT}/corridor-life.wav`,
    gain: 0.22,
    playbackRate: 1.006,
    highpassHz: 95,
    lowpassHz: 2800,
  },
  {
    name: "interior-electricity",
    url: `${AMBIENCE_ROOT}/interior-electricity.wav`,
    gain: 0.13,
    playbackRate: 1.012,
    highpassHz: 140,
    lowpassHz: 6200,
  },
] as const;

const RANDOM_SOUNDS: readonly RandomSoundSpec[] = [
  {
    name: "vacuum",
    urls: [
      `${RANDOM_ROOT}/vacuum.wav`,
      `${RANDOM_ROOT}/vacuum-2.wav`,
      `${RANDOM_ROOT}/vacuum-3.wav`,
    ],
    weight: 3.8,
    gain: 0.18,
    minDistanceM: 18,
    maxDistanceM: 36,
    yMinM: -5,
    yMaxM: 7,
    highpassHz: 120,
    lowpassHz: 1450,
    playbackRateJitter: 0.025,
  },
  {
    name: "dog-bark",
    urls: [
      `${RANDOM_ROOT}/dog-bark.wav`,
      `${RANDOM_ROOT}/dog-bark-2.wav`,
      `${RANDOM_ROOT}/dog-bark-3.wav`,
      `${RANDOM_ROOT}/dog-bark-4.wav`,
    ],
    weight: 3.0,
    gain: 0.3,
    minDistanceM: 16,
    maxDistanceM: 32,
    yMinM: -4,
    yMaxM: 6,
    highpassHz: 180,
    lowpassHz: 2300,
    playbackRateJitter: 0.035,
  },
  {
    name: "toilet-flush",
    urls: [`${RANDOM_ROOT}/toilet-flush.wav`],
    weight: 2.0,
    gain: 0.24,
    minDistanceM: 14,
    maxDistanceM: 28,
    yMinM: -3,
    yMaxM: 5,
    highpassHz: 90,
    lowpassHz: 1800,
    playbackRateJitter: 0.02,
  },
  {
    name: "baby-cry",
    urls: [
      `${RANDOM_ROOT}/baby-cry.wav`,
      `${RANDOM_ROOT}/baby-cry-2.wav`,
      `${RANDOM_ROOT}/baby-cry-3.wav`,
      `${RANDOM_ROOT}/baby-cry-4.wav`,
    ],
    weight: 1.35,
    gain: 0.26,
    minDistanceM: 20,
    maxDistanceM: 42,
    yMinM: -5,
    yMaxM: 8,
    highpassHz: 240,
    lowpassHz: 2600,
    playbackRateJitter: 0.03,
  },
  {
    name: "smoke-detector-chirp",
    urls: [`${RANDOM_ROOT}/smoke-detector-chirp.wav`],
    weight: 0.75,
    gain: 0.18,
    minDistanceM: 22,
    maxDistanceM: 46,
    yMinM: -5,
    yMaxM: 8,
    highpassHz: 650,
    lowpassHz: 5200,
    playbackRateJitter: 0.01,
  },
  {
    name: "ajmo-dinamo",
    urls: [`${RANDOM_ROOT}/ajmo-dinamo.wav`],
    weight: 0.55,
    gain: 0.22,
    minDistanceM: 26,
    maxDistanceM: 52,
    yMinM: -7,
    yMaxM: 9,
    highpassHz: 180,
    lowpassHz: 2100,
    playbackRateJitter: 0.018,
  },
] as const;

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer !== null) clearTimeout(timer);
}

export class FpBackgroundMusic {
  private ctx: AudioContext | null = null;
  private outGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private randomBus: GainNode | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private ambienceLayers: AmbienceLayer[] = [];
  private randomSounds: RandomSound[] = [];
  private activeMusic: ActiveMusicChunk | null = null;
  private activeAmbience: ActiveAmbienceLoop[] = [];
  private activeRandomSounds: ActiveRandomSound[] = [];
  private nextMusicTimer: ReturnType<typeof setTimeout> | null = null;
  private nextRandomTimer: ReturnType<typeof setTimeout> | null = null;
  private musicEnabled = true;
  private disposed = false;

  constructor(private readonly getPlayerWorldPosition?: () => Vec3Like) {}

  async attachSharedContext(ctx: AudioContext): Promise<boolean> {
    if (this.ctx === ctx && this.outGain && this.musicBus && this.ambienceBus && this.randomBus) {
      this.startIfReady();
      return true;
    }

    this.stopAll(0);
    const [musicBuffer, ambienceLayers, randomSounds] = await Promise.all([
      this.decodeBuffer(ctx, MUSIC_URL),
      this.decodeAmbienceLayers(ctx),
      this.decodeRandomSounds(ctx),
    ]);

    if (!musicBuffer) {
      console.warn("[FpBackgroundMusic] Missing or undecodable music asset:", MUSIC_URL);
    }
    if (ambienceLayers.length === 0) {
      console.warn("[FpBackgroundMusic] No ambience layers decoded.");
    }
    if (randomSounds.length === 0) {
      console.warn("[FpBackgroundMusic] No random distant sound cues decoded.");
    }
    if (!musicBuffer && ambienceLayers.length === 0 && randomSounds.length === 0) return false;

    const outGain = ctx.createGain();
    outGain.gain.value = 0;

    const musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_BUS_GAIN;

    const ambienceBus = ctx.createGain();
    ambienceBus.gain.value = AMBIENCE_BUS_GAIN;

    const randomBus = ctx.createGain();
    randomBus.gain.value = RANDOM_BUS_GAIN;

    musicBus.connect(outGain);
    ambienceBus.connect(outGain);
    randomBus.connect(outGain);
    outGain.connect(ctx.destination);

    this.ctx = ctx;
    this.outGain = outGain;
    this.musicBus = musicBus;
    this.ambienceBus = ambienceBus;
    this.randomBus = randomBus;
    this.musicBuffer = musicBuffer;
    this.ambienceLayers = ambienceLayers;
    this.randomSounds = randomSounds;
    this.disposed = false;
    this.startIfReady();
    return true;
  }

  setEnabled(enabled: boolean): void {
    if (this.musicEnabled === enabled) return;
    this.musicEnabled = enabled;

    if (!enabled) {
      clearTimer(this.nextMusicTimer);
      this.nextMusicTimer = null;
      this.stopActiveMusic(USER_FADE_SECONDS);
      return;
    }

    this.startMusicIfReady();
  }

  dispose(): void {
    this.disposed = true;
    this.stopAll(0);
    this.musicBus?.disconnect();
    this.ambienceBus?.disconnect();
    this.randomBus?.disconnect();
    this.outGain?.disconnect();
    this.ctx = null;
    this.outGain = null;
    this.musicBus = null;
    this.ambienceBus = null;
    this.randomBus = null;
    this.musicBuffer = null;
    this.ambienceLayers = [];
    this.randomSounds = [];
  }

  private startIfReady(): void {
    if (this.disposed || !this.ctx || !this.outGain) return;
    this.fadeOutGainTo(OUT_GAIN, USER_FADE_SECONDS);
    this.startAmbienceLoopsIfReady();
    this.startMusicIfReady();
    if (this.randomSounds.length > 0 && this.nextRandomTimer === null) {
      this.nextRandomTimer = setTimeout(
        () => this.playRandomDistantSound(),
        randomRange(RANDOM_FIRST_MIN_SECONDS, RANDOM_FIRST_MAX_SECONDS) * 1000,
      );
    }
  }

  private startMusicIfReady(): void {
    if (
      !this.musicEnabled ||
      this.disposed ||
      !this.ctx ||
      !this.musicBuffer ||
      this.activeMusic ||
      this.nextMusicTimer !== null
    ) {
      return;
    }
    this.nextMusicTimer = setTimeout(() => this.startMusicChunk(), 0);
  }

  private startAmbienceLoopsIfReady(): void {
    const ctx = this.ctx;
    const bus = this.ambienceBus;
    if (!ctx || !bus || this.activeAmbience.length > 0) return;

    const now = ctx.currentTime;
    for (const layer of this.ambienceLayers) {
      const src = ctx.createBufferSource();
      src.buffer = layer.buffer;
      src.loop = true;
      src.playbackRate.value = layer.playbackRate;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(layer.gain, now + AMBIENCE_FADE_SECONDS);

      const nodes: AudioNode[] = [];
      let tail: AudioNode = src;
      if (layer.highpassHz) {
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = layer.highpassHz;
        hp.Q.value = 0.707;
        tail.connect(hp);
        tail = hp;
        nodes.push(hp);
      }
      if (layer.lowpassHz) {
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = layer.lowpassHz;
        lp.Q.value = 0.707;
        tail.connect(lp);
        tail = lp;
        nodes.push(lp);
      }

      tail.connect(gain);
      gain.connect(bus);

      const offsetSeconds =
        layer.buffer.duration > 0 ? randomRange(0, layer.buffer.duration) : 0;
      src.start(now, offsetSeconds);
      this.activeAmbience.push({ src, gain, nodes });
    }
  }

  private startMusicChunk(): void {
    this.nextMusicTimer = null;
    const ctx = this.ctx;
    const musicBus = this.musicBus;
    const buffer = this.musicBuffer;
    if (!this.musicEnabled || this.disposed || !ctx || !musicBus || !buffer) return;

    this.stopActiveMusic(0);

    const now = ctx.currentTime;
    const minChunk = Math.min(CHUNK_MIN_SECONDS, Math.max(10, buffer.duration * 0.45));
    const maxChunk = Math.max(minChunk, Math.min(CHUNK_MAX_SECONDS, buffer.duration * 0.92));
    const chunkSeconds = randomRange(minChunk, maxChunk);
    const fadeSeconds = Math.min(CHUNK_FADE_SECONDS, chunkSeconds * 0.28);
    const maxOffset = Math.max(0, buffer.duration - chunkSeconds - 0.2);
    const offsetSeconds = maxOffset > 0 ? randomRange(0, maxOffset) : 0;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fadeSeconds);
    gain.gain.setValueAtTime(1, now + Math.max(fadeSeconds, chunkSeconds - fadeSeconds));
    gain.gain.linearRampToValueAtTime(0, now + chunkSeconds);

    src.connect(gain);
    gain.connect(musicBus);
    src.start(now, offsetSeconds, chunkSeconds);
    src.stop(now + chunkSeconds + 0.05);

    const active: ActiveMusicChunk = { src, gain };
    this.activeMusic = active;
    src.onended = () => {
      if (this.activeMusic !== active) return;
      gain.disconnect();
      this.activeMusic = null;
    };

    const silenceSeconds =
      Math.random() < SILENCE_CHANCE
        ? randomRange(SILENCE_MIN_SECONDS, SILENCE_MAX_SECONDS)
        : randomRange(SHORT_BREATH_MIN_SECONDS, SHORT_BREATH_MAX_SECONDS);
    this.nextMusicTimer = setTimeout(
      () => this.startMusicChunk(),
      Math.max(0, chunkSeconds + silenceSeconds) * 1000,
    );
  }

  private playRandomDistantSound(): void {
    this.nextRandomTimer = null;
    const ctx = this.ctx;
    const bus = this.randomBus;
    if (this.disposed || !ctx || !bus || this.randomSounds.length === 0) return;

    if (this.activeRandomSounds.length < RANDOM_MAX_ACTIVE) {
      const sound = this.pickRandomSound();
      const buffer = sound.buffers[Math.floor(Math.random() * sound.buffers.length)];
      if (buffer) this.playDistantSoundBuffer(sound, buffer);
    }

    this.nextRandomTimer = setTimeout(
      () => this.playRandomDistantSound(),
      randomRange(RANDOM_NEXT_MIN_SECONDS, RANDOM_NEXT_MAX_SECONDS) * 1000,
    );
  }

  private playDistantSoundBuffer(sound: RandomSound, buffer: AudioBuffer): void {
    const ctx = this.ctx;
    const bus = this.randomBus;
    if (!ctx || !bus) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 1 + randomRange(-sound.playbackRateJitter, sound.playbackRateJitter);

    const gain = ctx.createGain();
    gain.gain.value = sound.gain * randomRange(0.82, 1.08);

    const nodes: AudioNode[] = [];
    let tail: AudioNode = src;
    if (sound.highpassHz) {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = sound.highpassHz;
      hp.Q.value = 0.707;
      tail.connect(hp);
      tail = hp;
      nodes.push(hp);
    }

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = sound.lowpassHz;
    lp.Q.value = 0.707;
    tail.connect(lp);
    tail = lp;
    nodes.push(lp);

    const panner = ctx.createPanner();
    try {
      panner.panningModel = "HRTF";
    } catch {
      panner.panningModel = "equalpower";
    }
    panner.distanceModel = "inverse";
    panner.refDistance = RANDOM_REF_DISTANCE_M;
    panner.maxDistance = RANDOM_MAX_DISTANCE_M;
    panner.rolloffFactor = RANDOM_ROLLOFF;
    this.positionRandomPanner(panner, sound, now);

    tail.connect(gain);
    gain.connect(panner);
    panner.connect(bus);
    nodes.push(panner);

    const active: ActiveRandomSound = { src, gain, nodes };
    this.activeRandomSounds.push(active);
    src.onended = () => {
      const index = this.activeRandomSounds.indexOf(active);
      if (index >= 0) this.activeRandomSounds.splice(index, 1);
      gain.disconnect();
      for (const node of nodes) node.disconnect();
    };
    src.start(now);
  }

  private positionRandomPanner(panner: PannerNode, sound: RandomSound, atTime: number): void {
    const center = this.getPlayerWorldPosition?.() ?? { x: 0, y: 0, z: 0 };
    const angle = Math.random() * Math.PI * 2;
    const distance = randomRange(sound.minDistanceM, sound.maxDistanceM);
    const x = center.x + Math.cos(angle) * distance;
    const y = center.y + randomRange(sound.yMinM, sound.yMaxM);
    const z = center.z + Math.sin(angle) * distance;
    panner.positionX.setValueAtTime(x, atTime);
    panner.positionY.setValueAtTime(y, atTime);
    panner.positionZ.setValueAtTime(z, atTime);
  }

  private pickRandomSound(): RandomSound {
    const total = this.randomSounds.reduce((sum, sound) => sum + sound.weight, 0);
    let pick = Math.random() * total;
    for (const sound of this.randomSounds) {
      pick -= sound.weight;
      if (pick <= 0) return sound;
    }
    return this.randomSounds[this.randomSounds.length - 1]!;
  }

  private stopAll(fadeSeconds: number): void {
    clearTimer(this.nextMusicTimer);
    this.nextMusicTimer = null;
    clearTimer(this.nextRandomTimer);
    this.nextRandomTimer = null;
    this.stopActiveMusic(fadeSeconds);
    this.stopAmbience(fadeSeconds);
    this.stopRandomSounds(fadeSeconds);
  }

  private fadeOutGainTo(value: number, seconds: number): void {
    const ctx = this.ctx;
    const outGain = this.outGain;
    if (!ctx || !outGain) return;
    const now = ctx.currentTime;
    outGain.gain.cancelScheduledValues(now);
    outGain.gain.setValueAtTime(outGain.gain.value, now);
    outGain.gain.linearRampToValueAtTime(value, now + seconds);
  }

  private stopActiveMusic(fadeSeconds: number): void {
    const ctx = this.ctx;
    const active = this.activeMusic;
    if (!ctx || !active) {
      this.activeMusic = null;
      return;
    }

    const now = ctx.currentTime;
    try {
      active.gain.gain.cancelScheduledValues(now);
      active.gain.gain.setValueAtTime(active.gain.gain.value, now);
      active.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      active.src.onended = () => {
        active.gain.disconnect();
      };
      active.src.stop(now + fadeSeconds + 0.05);
    } catch {
      /* already stopped */
    }
    this.activeMusic = null;
  }

  private stopAmbience(fadeSeconds: number): void {
    const ctx = this.ctx;
    if (!ctx) {
      this.activeAmbience = [];
      return;
    }

    const now = ctx.currentTime;
    for (const loop of this.activeAmbience) {
      try {
        loop.gain.gain.cancelScheduledValues(now);
        loop.gain.gain.setValueAtTime(loop.gain.gain.value, now);
        loop.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
        loop.src.onended = () => {
          loop.gain.disconnect();
          for (const node of loop.nodes) node.disconnect();
        };
        loop.src.stop(now + fadeSeconds + 0.05);
      } catch {
        /* already stopped */
      }
    }
    this.activeAmbience = [];
  }

  private stopRandomSounds(fadeSeconds: number): void {
    const ctx = this.ctx;
    if (!ctx) {
      this.activeRandomSounds = [];
      return;
    }

    const now = ctx.currentTime;
    for (const active of this.activeRandomSounds) {
      try {
        active.gain.gain.cancelScheduledValues(now);
        active.gain.gain.setValueAtTime(active.gain.gain.value, now);
        active.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
        active.src.onended = () => {
          active.gain.disconnect();
          for (const node of active.nodes) node.disconnect();
        };
        active.src.stop(now + fadeSeconds + 0.05);
      } catch {
        /* already stopped */
      }
    }
    this.activeRandomSounds = [];
  }

  private async decodeAmbienceLayers(ctx: AudioContext): Promise<AmbienceLayer[]> {
    const layers = await Promise.all(
      AMBIENCE_LAYERS.map(async (layer): Promise<AmbienceLayer | null> => {
        const buffer = await this.decodeBuffer(ctx, layer.url);
        if (!buffer) {
          console.warn("[FpBackgroundMusic] Missing or undecodable ambience asset:", layer.url);
          return null;
        }
        return { ...layer, buffer };
      }),
    );
    return layers.filter((layer): layer is AmbienceLayer => layer !== null);
  }

  private async decodeRandomSounds(ctx: AudioContext): Promise<RandomSound[]> {
    const sounds = await Promise.all(
      RANDOM_SOUNDS.map(async (sound): Promise<RandomSound | null> => {
        const buffers = (
          await Promise.all(sound.urls.map((url) => this.decodeBuffer(ctx, url)))
        ).filter((buffer): buffer is AudioBuffer => buffer !== null);
        if (buffers.length === 0) {
          console.warn("[FpBackgroundMusic] Missing random distant sound cue:", sound.name);
          return null;
        }
        return { ...sound, buffers };
      }),
    );
    return sounds.filter((sound): sound is RandomSound => sound !== null);
  }

  private async decodeBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return await ctx.decodeAudioData(ab.slice(0));
    } catch {
      return null;
    }
  }
}

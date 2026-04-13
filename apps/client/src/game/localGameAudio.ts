/**
 * FP footstep audio — **Web Audio** path (decoded `AudioBuffer`s, light bus processing). Sounds more
 * controlled than spawning `HTMLAudioElement` every step (no per-hit element churn, stable gain).
 *
 * **Why not “only 4”?** Four was never a magic HL number — it was the minimum *coherent* set for
 * one surface. Big-budget first-person games more often ship **6–8** *matched* variants (same mic,
 * same shoe, same room, same peak/RMS). We load **up to six** stems if present; missing files are
 * skipped. **Quality and loudness-matching beat raw count** — ten mismatched clips will always sound
 * worse than six mastered as a set.
 *
 * **Authoring:** `apps/client/public/audio/ui/footstep.wav` … `footstep-6.wav` (any subset). Export
 * mono or centered stereo, **match peak/RMS** across variants, trim trailing silence. Stride-locked
 * to `headBobPhase` (same as view bob). Call {@link LocalGameAudio.unlock} from a **user gesture**.
 */

import { fpLocomotionConstants } from "@the-mammoth/engine";

const AUDIO_ROOT =
  `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;

const AUDIO_EXTENSIONS = ["wav", "ogg", "mp3"] as const;

const UI_STEM = `${AUDIO_ROOT}/ui`;

/** Up to six impacts; fewer files on disk is fine. */
const IMPACT_STEMS = [
  `${UI_STEM}/footstep`,
  `${UI_STEM}/footstep-2`,
  `${UI_STEM}/footstep-3`,
  `${UI_STEM}/footstep-4`,
  `${UI_STEM}/footstep-5`,
  `${UI_STEM}/footstep-6`,
] as const;

const STRIDE_PHASE_PER_STEP = Math.PI;

/** Post-compressor; per-hit gain also applied. */
const BUS_GAIN = 0.42;
const HIT_GAIN_BASE = 0.55;
const HIT_GAIN_JITTER = 0.08;

const PLAYBACK_JITTER = 0.018;
const PLAYBACK_MIN = 0.97;
const PLAYBACK_MAX = 1.045;

const V0_AUDIO = 0.15;

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function getAudioContextCtor(): typeof AudioContext | null {
  const g = globalThis as typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** Per-frame snapshot from the FP locomotion tick (see `mountFpSession`). */
export type LocalGameAudioMovement = {
  horizontalSpeed: number;
  stridePhaseRad: number;
  grounded: boolean;
  crouch: boolean;
  sprint: boolean;
  freeLook: boolean;
};

export class LocalGameAudio {
  private unlocked = false;
  private readonly sourceCache = new Map<string, Promise<string | null>>();
  private impactUrls: string[] = [];
  private readonly urlResolvePromise: Promise<void>;

  private ctx: AudioContext | null = null;
  private footstepBus: GainNode | null = null;
  private impactBuffers: AudioBuffer[] = [];

  private wasGrounded = true;
  private lastStrideStepCell = Number.NEGATIVE_INFINITY;
  private impactRR = 0;

  constructor() {
    this.urlResolvePromise = this.resolveFootstepUrlsInBackground();
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    await this.urlResolvePromise;

    if (this.impactUrls.length === 0) {
      console.warn(
        "[LocalGameAudio] No footstep URLs resolved. Add footstep.wav … footstep-6.wav under apps/client/public/audio/ui/",
      );
      return;
    }

    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      console.warn("[LocalGameAudio] Web Audio API not available.");
      return;
    }

    const ctx = new Ctor({ latencyHint: "interactive" });
    this.ctx = ctx;

    const buffers = await this.decodeImpactBuffers(ctx, this.impactUrls);
    this.impactBuffers = buffers;

    if (this.impactBuffers.length === 0) {
      console.warn("[LocalGameAudio] Failed to decode footstep assets.");
      void ctx.close();
      this.ctx = null;
      return;
    }

    const bus = ctx.createGain();
    bus.gain.value = BUS_GAIN;
    this.footstepBus = bus;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 85;
    hp.Q.value = 0.707;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 18;
    comp.ratio.value = 2.8;
    comp.attack.value = 0.002;
    comp.release.value = 0.11;

    bus.connect(hp);
    hp.connect(comp);
    comp.connect(ctx.destination);

    await ctx.resume().catch(() => undefined);
    this.unlocked = true;
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.footstepBus = null;
    this.impactBuffers = [];
    this.sourceCache.clear();
    this.impactUrls = [];
    this.unlocked = false;
    this.lastStrideStepCell = Number.NEGATIVE_INFINITY;
    this.impactRR = 0;
  }

  update(_dtSeconds: number, m: LocalGameAudioMovement): void {
    if (!this.unlocked || !this.ctx || !this.footstepBus || this.impactBuffers.length === 0) {
      return;
    }

    const { horizontalSpeed, stridePhaseRad, grounded, crouch, sprint, freeLook } = m;

    const strideCell = Math.floor((2 * stridePhaseRad) / STRIDE_PHASE_PER_STEP);

    const justLanded = grounded && !this.wasGrounded && !crouch;
    this.wasGrounded = grounded;

    if (justLanded) {
      this.lastStrideStepCell = strideCell;
      return;
    }

    const canStep =
      grounded && !crouch && !freeLook && horizontalSpeed > V0_AUDIO;

    if (!canStep) {
      this.lastStrideStepCell = strideCell;
      return;
    }

    if (strideCell > this.lastStrideStepCell) {
      this.playStep({ horizontalSpeed, sprint });
      this.lastStrideStepCell = strideCell;
    }
  }

  private playStep(opts: { horizontalSpeed: number; sprint: boolean }): void {
    const ctx = this.ctx;
    const bus = this.footstepBus;
    const buffers = this.impactBuffers;
    if (!ctx || !bus || buffers.length === 0) return;

    const run = fpLocomotionConstants.sprintSpeedMps;
    const speedT = clamp01((opts.horizontalSpeed - V0_AUDIO) / (run - V0_AUDIO));
    const baseBySpeed = lerp(0.997, 1.018, speedT);
    const sprintBump = opts.sprint ? 0.006 : 0;
    const jitter = (Math.random() - 0.5) * PLAYBACK_JITTER;
    const rate = Math.max(
      PLAYBACK_MIN,
      Math.min(PLAYBACK_MAX, baseBySpeed + sprintBump + jitter),
    );

    const buf = buffers[this.impactRR % buffers.length]!;
    this.impactRR += 1;

    const hitGain = ctx.createGain();
    hitGain.gain.value =
      HIT_GAIN_BASE * (1 - HIT_GAIN_JITTER + Math.random() * (2 * HIT_GAIN_JITTER));

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(hitGain);
    hitGain.connect(bus);
    src.start(ctx.currentTime);
  }

  private async decodeImpactBuffers(
    ctx: AudioContext,
    urls: readonly string[],
  ): Promise<AudioBuffer[]> {
    const out: AudioBuffer[] = [];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab.slice(0));
        out.push(buf);
      } catch {
        // skip bad or unsupported decode
      }
    }
    return out;
  }

  private async resolveFootstepUrlsInBackground(): Promise<void> {
    const resolved = await Promise.all(
      IMPACT_STEMS.map((stem) => this.resolveSource(stem)),
    );
    this.impactUrls = resolved.filter((u): u is string => u != null);
  }

  private resolveSource(
    stem: string,
    extensions: readonly string[] = AUDIO_EXTENSIONS,
  ): Promise<string | null> {
    const cacheKey = `${stem}|${extensions.join(",")}`;
    const cached = this.sourceCache.get(cacheKey);
    if (cached) return cached;
    const pending = this.resolveSourceUncached(stem, extensions);
    this.sourceCache.set(cacheKey, pending);
    return pending;
  }

  private async resolveSourceUncached(
    stem: string,
    extensions: readonly string[],
  ): Promise<string | null> {
    for (const extension of extensions) {
      const candidate = `${stem}.${extension}`;
      try {
        const response = await fetch(candidate, {
          method: "GET",
          cache: "no-cache",
        });
        if (response.ok) return candidate;
      } catch {
        // try next extension
      }
    }
    return null;
  }
}

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
 * **Authoring:** `apps/client/public/audio/ui/footstep.wav` … `footstep-6.wav` (any subset); footsteps
 * are **~1.00 s** each (hit early, tail pad OK). **Batch-normalize** after changing assets:
 * `pnpm content:normalize-footsteps` (RMS-match the set + shared peak ceiling; `--dry-run` first).
 * Stride-locked to `headBobPhase`. World pickup: `item-pick.wav`. Melee swing: default
 * `weapon-melee-swing*.wav` with legacy fallback to `weapon-crowbar-swing*.wav` (see
 * `meleeSwingSound.ts`). Call {@link LocalGameAudio.unlock} from a **user gesture**.
 */

import { fpLocomotionConstants } from "@the-mammoth/engine";
import {
  CONSUME_DRINK_STEM,
  CONSUME_EAT_STEM,
  CONSUME_STEM_MEDIA_EXTENSIONS,
} from "./consumeUiSound";
import { loadMeleeWeaponSwingBuffersByProfile } from "./meleeSwingSoundBuffers";

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

const ITEM_PICK_STEM = `${UI_STEM}/item-pick` as const;

const STRIDE_PHASE_PER_STEP = Math.PI;

/** Post-compressor; per-hit gain also applied (tune here for overall footstep loudness). */
const BUS_GAIN = 0.28;
const HIT_GAIN_BASE = 0.4;
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
  /** Passed for future use (e.g. view-only ducking); footsteps are not muted while free-looking. */
  freeLook: boolean;
};

export class LocalGameAudio {
  private unlocked = false;
  /**
   * Concurrent `unlock()` (canvas click + pickup prime, double-click, etc.) must not interleave —
   * each run used to assign `this.ctx` early then `await` decode; a second run could overwrite
   * `this.ctx` while the first still wired `footstepBus` / buffers to the first context →
   * `InvalidAccessError` on `connect` and a tight exception loop in `requestAnimationFrame`.
   */
  private unlockInFlight: Promise<void> | null = null;
  private readonly sourceCache = new Map<string, Promise<string | null>>();
  private impactUrls: string[] = [];
  private readonly urlResolvePromise: Promise<void>;

  private ctx: AudioContext | null = null;
  private footstepBus: GainNode | null = null;
  private impactBuffers: AudioBuffer[] = [];
  private meleeSwingBuffersByProfile = new Map<number, AudioBuffer[]>();
  private meleeSwingRR = 0;
  private itemPickBuffer: AudioBuffer | null = null;
  private consumeEatBuffer: AudioBuffer | null = null;
  private consumeDrinkBuffer: AudioBuffer | null = null;

  private wasGrounded = true;
  private lastStrideStepCell = Number.NEGATIVE_INFINITY;
  private impactRR = 0;

  constructor() {
    this.urlResolvePromise = this.resolveFootstepUrlsInBackground();
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    if (!this.unlockInFlight) {
      this.unlockInFlight = this.runUnlock();
    }
    try {
      await this.unlockInFlight;
    } finally {
      this.unlockInFlight = null;
    }
  }

  private async runUnlock(): Promise<void> {
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

    this.meleeSwingBuffersByProfile = await loadMeleeWeaponSwingBuffersByProfile(
      ctx,
      (stem) => this.resolveSource(stem),
      (c, urls) => this.decodeImpactBuffers(c, [...urls]),
    );
    if (!this.meleeSwingBuffersByProfile.has(0) || this.meleeSwingBuffersByProfile.get(0)!.length === 0) {
      console.warn(
        "[LocalGameAudio] Missing melee swing assets: add weapon-melee-swing.wav + weapon-melee-swing-2.wav (or legacy weapon-crowbar-swing*.wav) under public/audio/ui/",
      );
    }

    const itemPickUrl = await this.resolveSource(ITEM_PICK_STEM);
    if (itemPickUrl) {
      const decoded = await this.decodeImpactBuffers(ctx, [itemPickUrl]);
      this.itemPickBuffer = decoded[0] ?? null;
    }
    if (!this.itemPickBuffer) {
      console.warn(
        "[LocalGameAudio] Missing pickup UI asset: item-pick.wav under public/audio/ui/",
      );
    }

    const eatUrl = await this.resolveSource(CONSUME_EAT_STEM, CONSUME_STEM_MEDIA_EXTENSIONS);
    const drinkUrl = await this.resolveSource(CONSUME_DRINK_STEM, CONSUME_STEM_MEDIA_EXTENSIONS);
    if (eatUrl) {
      const decoded = await this.decodeImpactBuffers(ctx, [eatUrl]);
      this.consumeEatBuffer = decoded[0] ?? null;
    }
    if (drinkUrl) {
      const decoded = await this.decodeImpactBuffers(ctx, [drinkUrl]);
      this.consumeDrinkBuffer = decoded[0] ?? null;
    }
    if (!this.consumeEatBuffer || !this.consumeDrinkBuffer) {
      console.warn(
        "[LocalGameAudio] Missing consume UI assets: consume-eat.* / consume-drink.* under public/audio/ui/ (mp3 preferred).",
      );
    }

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
    this.meleeSwingBuffersByProfile.clear();
    this.itemPickBuffer = null;
    this.consumeEatBuffer = null;
    this.consumeDrinkBuffer = null;
    this.sourceCache.clear();
    this.impactUrls = [];
    this.unlocked = false;
    this.lastStrideStepCell = Number.NEGATIVE_INFINITY;
    this.impactRR = 0;
    this.meleeSwingRR = 0;
  }

  /** Shared Web Audio context after {@link LocalGameAudio.unlock} (for 3D world one-shots). */
  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  /** Decoded footstep stems — same order as on disk; for replicated footstep events. */
  getFootstepBuffers(): readonly AudioBuffer[] {
    return this.impactBuffers;
  }

  /**
   * First-person melee weapon swing — **local only** (immediate feedback). Other players hear the
   * server-emitted `world_sound_event` kind `MELEE_WEAPON_SWING` (proximity playback).
   *
   * @param soundProfile Upper bits sent in `variation` on the server — keep in sync with
   *        `meleeWeaponSwingSoundProfileFromDefId` for the active hotbar `def_id`.
   */
  playMeleeWeaponSwingLocal(soundProfile = 0): void {
    const buffers =
      this.meleeSwingBuffersByProfile.get(soundProfile) ?? this.meleeSwingBuffersByProfile.get(0);
    if (!this.unlocked || !this.ctx || !this.footstepBus || !buffers || buffers.length === 0) {
      return;
    }
    const ctx = this.ctx;
    const bus = this.footstepBus;
    const buf = buffers[this.meleeSwingRR % buffers.length]!;
    this.meleeSwingRR += 1;

    const hitGain = ctx.createGain();
    hitGain.gain.value = 0.52 * (0.92 + Math.random() * 0.16);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.98 + Math.random() * 0.05;
    src.connect(hitGain);
    hitGain.connect(bus);
    src.start(ctx.currentTime);
  }

  /** Short UI blip when a world drop is successfully granted to inventory (local client). */
  playItemPickLocal(): void {
    if (!this.unlocked || !this.ctx || !this.footstepBus || !this.itemPickBuffer) {
      return;
    }
    const ctx = this.ctx;
    const bus = this.footstepBus;
    const buf = this.itemPickBuffer;

    const hitGain = ctx.createGain();
    hitGain.gain.value = 0.44 * (0.94 + Math.random() * 0.12);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.99 + Math.random() * 0.04;
    src.connect(hitGain);
    hitGain.connect(bus);
    src.start(ctx.currentTime);
  }

  /** Immediate hotbar consume feedback (local client); others hear replicated `world_sound_event`. */
  playHotbarConsumeLocal(profile: "eat" | "drink"): void {
    const buf = profile === "drink" ? this.consumeDrinkBuffer : this.consumeEatBuffer;
    if (!this.unlocked || !this.ctx || !this.footstepBus || !buf) {
      return;
    }
    const ctx = this.ctx;
    const bus = this.footstepBus;

    const hitGain = ctx.createGain();
    hitGain.gain.value = 0.5 * (0.92 + Math.random() * 0.14);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.99 + Math.random() * 0.04;
    src.connect(hitGain);
    hitGain.connect(bus);
    src.start(ctx.currentTime);
  }

  update(_dtSeconds: number, m: LocalGameAudioMovement): void {
    if (!this.unlocked || !this.ctx || !this.footstepBus || this.impactBuffers.length === 0) {
      return;
    }

    const { horizontalSpeed, stridePhaseRad, grounded, crouch, sprint } = m;

    const strideCell = Math.floor((2 * stridePhaseRad) / STRIDE_PHASE_PER_STEP);

    const justLanded = grounded && !this.wasGrounded && !crouch;
    this.wasGrounded = grounded;

    if (justLanded) {
      this.playStep({ horizontalSpeed, sprint });
      this.lastStrideStepCell = strideCell;
      return;
    }

    const canStep = grounded && !crouch && horizontalSpeed > V0_AUDIO;

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

/**
 * Browser-local one-shot audio (no server). Pattern adapted from
 * `cyberpunk-apartment/src/game/runtime/AudioSystem.ts`: resolve stems by probing extensions,
 * cache URLs, random variant pick, lightweight footstep cadence from horizontal speed + grounded.
 *
 * **Realism (design targets):**
 * - **How many sounds:** 6–12 *dry* impacts per surface class beats 2–4; split **L/R** (or phase) so
 *   the same file is not heard twice in a row at identical pitch. Later: separate pools per material
 *   (concrete / metal / carpet) from a short ground raycast.
 * - **Overlapping:** one **short transient** (~50–120 ms) per foot; avoid stacking long tails (mud /
 *   reverb). Optional **second layer** at −12 to −18 dB: cloth / scuff, 2–3 variants, triggered with
 *   the same cadence — subtle, not a second “stomp.”
 * - **Pitch / rate:** keep `playbackRate` within ~**0.92–1.08** for walk/run on one surface; big shifts
 *   read as wrong acoustics. Map rate **lightly** to planar speed + tiny jitter; use **lower** rate
 *   and **slightly higher** gain on landing for a heavier thud.
 */

import { fpLocomotionConstants } from "@the-mammoth/engine";

const AUDIO_ROOT =
  `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;

const AUDIO_EXTENSIONS = ["wav", "ogg", "mp3"] as const;

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const FOOTSTEP_STEM = `${AUDIO_ROOT}/ui/footstep`;

/** Match footstep gate in `update` (m/s). */
const V0_AUDIO = 0.25;

export type LocalGameAudioMovement = {
  /** Planar speed from locomotion (m/s). */
  horizontalSpeed: number;
  grounded: boolean;
  /** Skip footsteps while crouched (stealth / different gait — not authored yet). */
  crouch: boolean;
  /** Faster cadence when sprinting. */
  sprint: boolean;
  /** Alt look: no footsteps (matches camera bob suppression). */
  freeLook: boolean;
};

export class LocalGameAudio {
  private unlocked = false;
  private prepared = false;
  private readonly sourceCache = new Map<string, Promise<string | null>>();
  private footstepSources: string[] = [];
  private readonly preparePromise: Promise<void>;

  private wasGrounded = true;
  private footstepCooldown = 0;
  /** Avoid the same variant twice in a row when multiple files exist. */
  private lastFootstepVariant = -1;

  constructor() {
    this.preparePromise = this.resolveFootstepsInBackground();
  }

  /**
   * Call from a **user gesture** (e.g. canvas click) so `HTMLAudioElement.play()` is allowed.
   */
  async unlock(): Promise<void> {
    if (this.unlocked) return;
    await this.prepare();
    this.unlocked = true;
  }

  dispose(): void {
    this.sourceCache.clear();
    this.footstepSources = [];
    this.unlocked = false;
    this.prepared = false;
  }

  /**
   * Drive footstep cadence once per frame after locomotion is integrated.
   */
  update(dtSeconds: number, m: LocalGameAudioMovement): void {
    if (!this.unlocked || this.footstepSources.length === 0) return;

    const { horizontalSpeed, grounded, crouch, sprint, freeLook } = m;

    const justLanded = grounded && !this.wasGrounded && !crouch;
    this.wasGrounded = grounded;

    if (justLanded) {
      this.playFootstep({
        horizontalSpeed,
        sprint,
        kind: "land",
      });
      this.footstepCooldown = this.stepIntervalSeconds(horizontalSpeed, sprint);
      return;
    }

    const canStep =
      grounded && !crouch && !freeLook && horizontalSpeed > 0.25;

    if (canStep) {
      const interval = this.stepIntervalSeconds(horizontalSpeed, sprint);
      this.footstepCooldown -= dtSeconds;
      if (this.footstepCooldown <= 0) {
        this.playFootstep({
          horizontalSpeed,
          sprint,
          kind: "step",
        });
        this.footstepCooldown = interval;
      }
    } else {
      this.footstepCooldown = 0;
    }
  }

  /**
   * Cadence tightens with speed; sprint forces a faster floor than a slow walk.
   */
  private stepIntervalSeconds(horizontalSpeed: number, sprint: boolean): number {
    const walk = fpLocomotionConstants.walkSpeedMps;
    const run = fpLocomotionConstants.sprintSpeedMps;
    if (sprint) {
      const t = clamp01((horizontalSpeed - walk) / (run - walk));
      return lerp(0.38, 0.28, t);
    }
    const t = clamp01((horizontalSpeed - V0_AUDIO) / (walk - V0_AUDIO));
    return lerp(0.55, 0.44, t);
  }

  private pickFootstepSrc(): string | undefined {
    const sources = this.footstepSources;
    const n = sources.length;
    if (n === 0) return undefined;
    if (n === 1) return sources[0];
    let i = Math.floor(Math.random() * n);
    if (i === this.lastFootstepVariant) i = (i + 1) % n;
    this.lastFootstepVariant = i;
    return sources[i];
  }

  /**
   * Subtle speed → playbackRate; landings slightly lower pitch + more body.
   */
  private playFootstep(opts: {
    horizontalSpeed: number;
    sprint: boolean;
    kind: "step" | "land";
  }): void {
    const src = this.pickFootstepSrc();
    if (!src) return;
    const walk = fpLocomotionConstants.walkSpeedMps;
    const run = fpLocomotionConstants.sprintSpeedMps;
    const speedT = clamp01((opts.horizontalSpeed - V0_AUDIO) / (run - V0_AUDIO));
    const baseBySpeed = lerp(0.97, 1.05, speedT);
    const sprintBump = opts.sprint && opts.kind === "step" ? 0.02 : 0;
    const jitter = (Math.random() - 0.5) * 0.05;
    const landMul = opts.kind === "land" ? 0.94 : 1;
    const rate = (baseBySpeed + sprintBump + jitter) * landMul;
    const clampedRate = Math.max(0.9, Math.min(1.12, rate));

    const audio = new Audio();
    audio.volume = opts.kind === "land" ? 0.32 : 0.24;
    audio.playbackRate = clampedRate;
    audio.src = src;
    void audio.play().catch(() => undefined);
  }

  private async prepare(): Promise<void> {
    if (this.prepared) return;
    this.prepared = true;
    await this.preparePromise;
  }

  private async resolveFootstepsInBackground(): Promise<void> {
    const [s1, s2, s3, s4] = await Promise.all([
      this.resolveSource(FOOTSTEP_STEM),
      this.resolveSource(`${FOOTSTEP_STEM}-2`),
      this.resolveSource(`${FOOTSTEP_STEM}-3`),
      this.resolveSource(`${FOOTSTEP_STEM}-4`),
    ]);
    const out: string[] = [];
    if (s1) out.push(s1);
    if (s2) out.push(s2);
    if (s3) out.push(s3);
    if (s4) out.push(s4);
    this.footstepSources = out;
    if (out.length === 0) {
      console.warn(
        `[LocalGameAudio] No footstep files under ${FOOTSTEP_STEM}.* — add wav/ogg/mp3 to public/audio/ui/`,
      );
    }
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

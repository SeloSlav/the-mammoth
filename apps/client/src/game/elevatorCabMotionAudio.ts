/**
 * Looping spatial cab-motion rumble from replicated `ElevatorCar` rows + `fpElevatorWorld` prediction
 * (same source as visuals). Continuous loops are not represented as `world_sound_event` rows — each
 * client evaluates emitters locally from subscribed server state.
 */

import * as THREE from "three";

export type FpElevCabMotionAudioEmitter = {
  shaftKey: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Signed vertical velocity (m/s) from the same prediction as cab visuals. */
  vyMps: number;
};

const AUDIO_ROOT =
  `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;
const STEM = `${AUDIO_ROOT}/ui/elevator-cab` as const;
const AUDIO_EXTENSIONS = ["wav", "ogg", "mp3"] as const;

const BUS_GAIN = 0.34;
const MAX_DISTANCE_M = 34;
const REF_DISTANCE_M = 0.55;
const ROLLOFF = 1.05;
/** Ignore numerical jitter when the cab is effectively stopped. */
const MIN_ABS_VY_MPS = 0.028;

type ActiveLoop = {
  src: AudioBufferSourceNode;
  dry: GainNode;
  panner: PannerNode;
};

export class ElevatorCabMotionAudio {
  private ctx: AudioContext | null = null;
  private outGain: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private readonly active = new Map<string, ActiveLoop>();
  private readonly sourceCache = new Map<string, Promise<string | null>>();

  constructor(private readonly getCamera: () => THREE.Camera) {}

  async attachSharedContext(ctx: AudioContext): Promise<boolean> {
    if (this.ctx === ctx && this.buffer && this.outGain) return true;
    const decoded = await this.decodeBuffer(ctx);
    if (!decoded) return false;
    const g = ctx.createGain();
    g.gain.value = BUS_GAIN;
    g.connect(ctx.destination);
    this.ctx = ctx;
    this.buffer = decoded;
    this.outGain = g;
    return true;
  }

  /** Align Web Audio listener with the FP camera — call same frame as {@link WorldProximityAudio.syncListener}. */
  syncListener(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const cam = this.getCamera();
    cam.updateMatrixWorld(true);
    const m = cam.matrixWorld.elements;
    const px = m[12]!;
    const py = m[13]!;
    const pz = m[14]!;
    const fx = -m[8]!;
    const fy = -m[9]!;
    const fz = -m[10]!;
    const ux = m[4]!;
    const uy = m[5]!;
    const uz = m[6]!;
    const ls = ctx.listener;
    const t = ctx.currentTime;
    if ("positionX" in ls && ls.positionX) {
      ls.positionX.setValueAtTime(px, t);
      ls.positionY.setValueAtTime(py, t);
      ls.positionZ.setValueAtTime(pz, t);
      ls.forwardX.setValueAtTime(fx, t);
      ls.forwardY.setValueAtTime(fy, t);
      ls.forwardZ.setValueAtTime(fz, t);
      ls.upX.setValueAtTime(ux, t);
      ls.upY.setValueAtTime(uy, t);
      ls.upZ.setValueAtTime(uz, t);
    }
  }

  sync(emitters: readonly FpElevCabMotionAudioEmitter[]): void {
    const ctx = this.ctx;
    const out = this.outGain;
    const buf = this.buffer;
    if (!ctx || !out || !buf) return;

    const want = new Set<string>();
    for (const e of emitters) {
      if (Math.abs(e.vyMps) < MIN_ABS_VY_MPS) continue;
      want.add(e.shaftKey);
    }

    const t = ctx.currentTime;
    for (const [key, loop] of this.active) {
      if (!want.has(key)) {
        try {
          loop.src.stop(t);
        } catch {
          /* already stopped */
        }
        loop.src.disconnect();
        loop.dry.disconnect();
        loop.panner.disconnect();
        this.active.delete(key);
      }
    }

    for (const e of emitters) {
      if (Math.abs(e.vyMps) < MIN_ABS_VY_MPS) continue;
      const existing = this.active.get(e.shaftKey);
      if (existing) {
        existing.panner.positionX.setValueAtTime(e.worldX, t);
        existing.panner.positionY.setValueAtTime(e.worldY, t);
        existing.panner.positionZ.setValueAtTime(e.worldZ, t);
        const g = Math.min(1.0, 0.72 + Math.min(1, Math.abs(e.vyMps) / 2.8) * 0.22);
        existing.dry.gain.setValueAtTime(g, t);
        continue;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const dry = ctx.createGain();
      dry.gain.value = Math.min(1.0, 0.72 + Math.min(1, Math.abs(e.vyMps) / 2.8) * 0.22);

      const panner = ctx.createPanner();
      try {
        panner.panningModel = "HRTF";
      } catch {
        panner.panningModel = "equalpower";
      }
      panner.distanceModel = "inverse";
      panner.refDistance = REF_DISTANCE_M;
      panner.maxDistance = MAX_DISTANCE_M;
      panner.rolloffFactor = ROLLOFF;
      panner.positionX.setValueAtTime(e.worldX, t);
      panner.positionY.setValueAtTime(e.worldY, t);
      panner.positionZ.setValueAtTime(e.worldZ, t);

      src.connect(dry);
      dry.connect(panner);
      panner.connect(out);

      src.start(t);
      this.active.set(e.shaftKey, { src, dry, panner });
    }
  }

  dispose(): void {
    if (this.ctx) {
      const t = this.ctx.currentTime;
      for (const [, loop] of this.active) {
        try {
          loop.src.stop(t);
        } catch {
          /* ignore */
        }
      }
    }
    this.active.clear();
    this.ctx = null;
    this.outGain = null;
    this.buffer = null;
    this.sourceCache.clear();
  }

  private async decodeBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
    const url = await this.resolveSource(STEM, AUDIO_EXTENSIONS);
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return await ctx.decodeAudioData(ab.slice(0));
    } catch {
      return null;
    }
  }

  private resolveSource(
    stem: string,
    extensions: readonly string[],
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
        /* try next */
      }
    }
    return null;
  }
}

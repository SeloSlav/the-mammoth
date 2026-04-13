/**
 * **Replicated** one-shots (`world_sound_event`): 3D Web Audio for other players’ footsteps,
 * crowbar swings, and world item pickups. The local player uses `LocalGameAudio` for immediate
 * feedback where applicable and skips their own replicated rows here (no double foot / swing /
 * pickup blip for the actor).
 */

import * as THREE from "three";
import { and } from "spacetimedb";
import type { DbConnection, SubscriptionHandle } from "../module_bindings";
import { tables } from "../module_bindings";
import type { WorldSoundEvent } from "../module_bindings/types";

export const WORLD_SOUND_KIND_FOOTSTEP = 0;
export const WORLD_SOUND_KIND_CROWBAR_SWING = 1;
/** Keep in sync with `apps/server/src/world_sound.rs` `KIND_ITEM_PICKUP`. */
export const WORLD_SOUND_KIND_ITEM_PICKUP = 2;

const AUDIO_ROOT =
  `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;
const UI_STEM = `${AUDIO_ROOT}/ui`;
const CROWBAR_STEMS = [
  `${UI_STEM}/weapon-crowbar-swing`,
  `${UI_STEM}/weapon-crowbar-swing-2`,
] as const;
const ITEM_PICK_STEM = `${UI_STEM}/item-pick` as const;
const AUDIO_EXTENSIONS = ["wav", "ogg", "mp3"] as const;

const WORLD_BUS_GAIN = 0.38;

export class WorldProximityAudio {
  private ctx: AudioContext | null = null;
  private worldGain: GainNode | null = null;
  private footBuffers: readonly AudioBuffer[] = [];
  private crowbarBuffers: AudioBuffer[] = [];
  private itemPickBuffer: AudioBuffer | null = null;
  private soundSub: SubscriptionHandle | null = null;
  private readonly sourceCache = new Map<string, Promise<string | null>>();

  constructor(
    private readonly conn: DbConnection,
    private readonly getCamera: () => THREE.Camera,
  ) {}

  /**
   * Wire into the same `AudioContext` as {@link LocalGameAudio} after unlock; decodes crowbar
   * stems and item-pick for replicated one-shots.
   */
  async attachSharedContext(
    ctx: AudioContext,
    footstepBuffers: readonly AudioBuffer[],
  ): Promise<void> {
    this.ctx = ctx;
    this.footBuffers = footstepBuffers;
    this.crowbarBuffers = await this.decodeCrowbarBuffers(ctx);
    this.itemPickBuffer = await this.decodeItemPickBuffer(ctx);

    if (!this.worldGain) {
      const g = ctx.createGain();
      g.gain.value = WORLD_BUS_GAIN;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 55;
      hp.Q.value = 0.707;
      g.connect(hp);
      hp.connect(ctx.destination);
      this.worldGain = g;
    }
  }

  /** AOI subscription — call with the same anchor you use for `player_pose` (slightly wider). */
  subscribeAoi(centerX: number, centerZ: number, halfExtent: number): void {
    const x0 = centerX - halfExtent;
    const x1 = centerX + halfExtent;
    const z0 = centerZ - halfExtent;
    const z1 = centerZ + halfExtent;
    const query = tables.world_sound_event.where((r) =>
      and(and(r.x.gte(x0), r.x.lte(x1)), and(r.z.gte(z0), r.z.lte(z1))),
    );

    if (this.soundSub?.isActive()) {
      this.soundSub.unsubscribe();
    }
    this.conn.db.world_sound_event.removeOnInsert(this.onInsert);
    this.conn.db.world_sound_event.onInsert(this.onInsert);
    this.soundSub = this.conn
      .subscriptionBuilder()
      .onApplied(() => undefined)
      .subscribe(query);
  }

  /** Call once per frame before playing new inserts (panner uses listener pose). */
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

  dispose(): void {
    this.conn.db.world_sound_event.removeOnInsert(this.onInsert);
    if (this.soundSub?.isActive()) {
      this.soundSub.unsubscribe();
    }
    this.soundSub = null;
    this.ctx = null;
    this.worldGain = null;
    this.footBuffers = [];
    this.crowbarBuffers = [];
    this.itemPickBuffer = null;
    this.sourceCache.clear();
  }

  private readonly onInsert = (_ctx: unknown, row: WorldSoundEvent) => {
    this.handleInsert(row);
  };

  private handleInsert(row: WorldSoundEvent): void {
    const ctx = this.ctx;
    const out = this.worldGain;
    const selfId = this.conn.identity;
    if (!ctx || !out || !selfId) return;
    if (selfId.isEqual(row.emitter)) return;

    let buf: AudioBuffer | null = null;
    if (row.kind === WORLD_SOUND_KIND_FOOTSTEP) {
      if (this.footBuffers.length === 0) return;
      buf = this.footBuffers[row.variation % this.footBuffers.length]!;
    } else if (row.kind === WORLD_SOUND_KIND_CROWBAR_SWING) {
      if (this.crowbarBuffers.length === 0) return;
      buf = this.crowbarBuffers[row.variation & 1]!;
    } else if (row.kind === WORLD_SOUND_KIND_ITEM_PICKUP) {
      if (!this.itemPickBuffer) return;
      buf = this.itemPickBuffer;
    } else {
      return;
    }

    const t = ctx.currentTime;
    const cam = this.getCamera();
    const lx = cam.position.x;
    const ly = cam.position.y;
    const lz = cam.position.z;
    const d = Math.hypot(row.x - lx, row.y - ly, row.z - lz);
    if (d > row.maxDistanceM * 1.08) return;

    const dry = ctx.createGain();
    dry.gain.value = Math.min(1.15, row.volume);

    const panner = ctx.createPanner();
    try {
      panner.panningModel = "HRTF";
    } catch {
      panner.panningModel = "equalpower";
    }
    panner.distanceModel = "inverse";
    panner.refDistance = 0.4;
    panner.maxDistance = Math.max(2.0, row.maxDistanceM);
    panner.rolloffFactor = 1.1;
    panner.positionX.setValueAtTime(row.x, t);
    panner.positionY.setValueAtTime(row.y, t);
    panner.positionZ.setValueAtTime(row.z, t);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (row.kind === WORLD_SOUND_KIND_ITEM_PICKUP) {
      src.playbackRate.value = 0.99 + Math.random() * 0.04;
    }
    src.connect(dry);
    dry.connect(panner);
    panner.connect(out);
    src.start(t);
  }

  private async decodeItemPickBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
    const url = await this.resolveSource(ITEM_PICK_STEM);
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

  private async decodeCrowbarBuffers(ctx: AudioContext): Promise<AudioBuffer[]> {
    const urls = await Promise.all(
      CROWBAR_STEMS.map((stem) => this.resolveSource(stem)),
    );
    const resolved = urls.filter((u): u is string => u != null);
    const out: AudioBuffer[] = [];
    for (const url of resolved) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        out.push(await ctx.decodeAudioData(ab.slice(0)));
      } catch {
        // skip
      }
    }
    return out;
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

/**
 * **Replicated** one-shots (`world_sound_event`): 3D Web Audio for footsteps, melee weapon swings,
 * pickups, hotbar consume (eat / drink), and elevator UI. The emitter skips **most** of their own rows
 * (footsteps / swings / pickup / consume have immediate or local paths in {@link LocalGameAudio}).
 * Elevator floor / hail presses and landing corridor door toggles use **only** this path so the
 * actor hears the same spatial cue as observers.
 */

import * as THREE from "three";
import { and } from "spacetimedb";
import type { DbConnection, SubscriptionHandle } from "../module_bindings";
import { tables } from "../module_bindings";
import type { WorldSoundEvent } from "../module_bindings/types";
import {
  meleeSwingProfileFromVariation,
  meleeSwingStemIndexFromVariation,
} from "./meleeSwingSound";
import {
  CONSUME_DRINK_STEM,
  CONSUME_EAT_STEM,
  CONSUME_STEM_MEDIA_EXTENSIONS,
} from "./consumeUiSound";
import { loadMeleeWeaponSwingBuffersByProfile } from "./meleeSwingSoundBuffers";

export const WORLD_SOUND_KIND_FOOTSTEP = 0;
/** Keep in sync with `apps/server/src/world_sound.rs` `KIND_MELEE_WEAPON_SWING`. */
export const WORLD_SOUND_KIND_MELEE_WEAPON_SWING = 1;
/** Keep in sync with `apps/server/src/world_sound.rs` `KIND_ITEM_PICKUP`. */
export const WORLD_SOUND_KIND_ITEM_PICKUP = 2;
/** Keep in sync with `apps/server/src/world_sound.rs` `KIND_CONSUME_EAT`. */
export const WORLD_SOUND_KIND_CONSUME_EAT = 3;
/** Keep in sync with `apps/server/src/world_sound.rs` `KIND_CONSUME_DRINK`. */
export const WORLD_SOUND_KIND_CONSUME_DRINK = 4;
/** Keep in sync with `apps/server/src/world_sound.rs` `KIND_ELEVATOR_FLOOR_BUTTON`. */
export const WORLD_SOUND_KIND_ELEVATOR_FLOOR_BUTTON = 5;
/** Keep in sync with `apps/server/src/world_sound.rs` `KIND_ELEVATOR_LANDING_HAIL`. */
export const WORLD_SOUND_KIND_ELEVATOR_LANDING_HAIL = 6;
/** Keep in sync with `apps/server/src/world_sound.rs` `KIND_LANDING_EXTERIOR_DOOR_OPEN`. */
export const WORLD_SOUND_KIND_LANDING_EXTERIOR_DOOR_OPEN = 7;
/** Keep in sync with `apps/server/src/world_sound.rs` `KIND_LANDING_EXTERIOR_DOOR_CLOSE`. */
export const WORLD_SOUND_KIND_LANDING_EXTERIOR_DOOR_CLOSE = 8;

const AUDIO_ROOT =
  `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;
const UI_STEM = `${AUDIO_ROOT}/ui`;
const ITEM_PICK_STEM = `${UI_STEM}/item-pick` as const;
const ELEVATOR_FLOOR_BUTTON_STEM = `${UI_STEM}/elevator-floor-button` as const;
const ELEVATOR_LANDING_HAIL_STEM = `${UI_STEM}/elevator-hail` as const;
const DOOR_OPEN_STEM = `${UI_STEM}/door-open` as const;
const DOOR_CLOSE_STEM = `${UI_STEM}/door-close` as const;
const AUDIO_EXTENSIONS = ["wav", "ogg", "mp3"] as const;

const WORLD_BUS_GAIN = 0.38;

export class WorldProximityAudio {
  private ctx: AudioContext | null = null;
  private worldGain: GainNode | null = null;
  private footBuffers: readonly AudioBuffer[] = [];
  private meleeSwingBuffersByProfile = new Map<number, AudioBuffer[]>();
  private itemPickBuffer: AudioBuffer | null = null;
  private consumeEatBuffer: AudioBuffer | null = null;
  private consumeDrinkBuffer: AudioBuffer | null = null;
  private elevatorFloorButtonBuffer: AudioBuffer | null = null;
  private elevatorLandingHailBuffer: AudioBuffer | null = null;
  private doorOpenBuffer: AudioBuffer | null = null;
  private doorCloseBuffer: AudioBuffer | null = null;
  private soundSub: SubscriptionHandle | null = null;
  private readonly sourceCache = new Map<string, Promise<string | null>>();

  constructor(
    private readonly conn: DbConnection,
    private readonly getCamera: () => THREE.Camera,
  ) {}

  /**
   * Wire into the same `AudioContext` as {@link LocalGameAudio} after unlock; decodes melee swing,
   * item-pick, and consume stems for replicated one-shots.
   */
  async attachSharedContext(
    ctx: AudioContext,
    footstepBuffers: readonly AudioBuffer[],
  ): Promise<void> {
    this.ctx = ctx;
    this.footBuffers = footstepBuffers;
    this.meleeSwingBuffersByProfile = await loadMeleeWeaponSwingBuffersByProfile(
      ctx,
      (stem) => this.resolveSource(stem),
      async (c, urls) => {
        const out: AudioBuffer[] = [];
        for (const url of urls) {
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const ab = await res.arrayBuffer();
            out.push(await c.decodeAudioData(ab.slice(0)));
          } catch {
            // skip
          }
        }
        return out;
      },
    );
    this.itemPickBuffer = await this.decodeItemPickBuffer(ctx);
    this.consumeEatBuffer = await this.decodeSingleStem(ctx, CONSUME_EAT_STEM, CONSUME_STEM_MEDIA_EXTENSIONS);
    this.consumeDrinkBuffer = await this.decodeSingleStem(
      ctx,
      CONSUME_DRINK_STEM,
      CONSUME_STEM_MEDIA_EXTENSIONS,
    );
    this.elevatorFloorButtonBuffer = await this.decodeSingleStem(ctx, ELEVATOR_FLOOR_BUTTON_STEM);
    this.elevatorLandingHailBuffer = await this.decodeSingleStem(ctx, ELEVATOR_LANDING_HAIL_STEM);
    this.doorOpenBuffer = await this.decodeSingleStem(ctx, DOOR_OPEN_STEM);
    this.doorCloseBuffer = await this.decodeSingleStem(ctx, DOOR_CLOSE_STEM);

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
    this.meleeSwingBuffersByProfile.clear();
    this.itemPickBuffer = null;
    this.consumeEatBuffer = null;
    this.consumeDrinkBuffer = null;
    this.elevatorFloorButtonBuffer = null;
    this.elevatorLandingHailBuffer = null;
    this.doorOpenBuffer = null;
    this.doorCloseBuffer = null;
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
    if (selfId.isEqual(row.emitter)) {
      const hearOwnSpatial =
        row.kind === WORLD_SOUND_KIND_ELEVATOR_FLOOR_BUTTON ||
        row.kind === WORLD_SOUND_KIND_ELEVATOR_LANDING_HAIL ||
        row.kind === WORLD_SOUND_KIND_LANDING_EXTERIOR_DOOR_OPEN ||
        row.kind === WORLD_SOUND_KIND_LANDING_EXTERIOR_DOOR_CLOSE;
      if (!hearOwnSpatial) return;
    }

    let buf: AudioBuffer | null = null;
    if (row.kind === WORLD_SOUND_KIND_FOOTSTEP) {
      if (this.footBuffers.length === 0) return;
      buf = this.footBuffers[row.variation % this.footBuffers.length]!;
    } else if (row.kind === WORLD_SOUND_KIND_MELEE_WEAPON_SWING) {
      const profile = meleeSwingProfileFromVariation(row.variation);
      const stemIdx = meleeSwingStemIndexFromVariation(row.variation);
      const list =
        this.meleeSwingBuffersByProfile.get(profile) ??
        this.meleeSwingBuffersByProfile.get(0);
      if (!list || list.length === 0) return;
      buf = list[stemIdx % list.length]!;
    } else if (row.kind === WORLD_SOUND_KIND_ITEM_PICKUP) {
      if (!this.itemPickBuffer) return;
      buf = this.itemPickBuffer;
    } else if (row.kind === WORLD_SOUND_KIND_CONSUME_EAT) {
      if (!this.consumeEatBuffer) return;
      buf = this.consumeEatBuffer;
    } else if (row.kind === WORLD_SOUND_KIND_CONSUME_DRINK) {
      if (!this.consumeDrinkBuffer) return;
      buf = this.consumeDrinkBuffer;
    } else if (row.kind === WORLD_SOUND_KIND_ELEVATOR_FLOOR_BUTTON) {
      if (!this.elevatorFloorButtonBuffer) return;
      buf = this.elevatorFloorButtonBuffer;
    } else if (row.kind === WORLD_SOUND_KIND_ELEVATOR_LANDING_HAIL) {
      if (!this.elevatorLandingHailBuffer) return;
      buf = this.elevatorLandingHailBuffer;
    } else if (row.kind === WORLD_SOUND_KIND_LANDING_EXTERIOR_DOOR_OPEN) {
      if (!this.doorOpenBuffer) return;
      buf = this.doorOpenBuffer;
    } else if (row.kind === WORLD_SOUND_KIND_LANDING_EXTERIOR_DOOR_CLOSE) {
      if (!this.doorCloseBuffer) return;
      buf = this.doorCloseBuffer;
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
    if (
      row.kind === WORLD_SOUND_KIND_ITEM_PICKUP ||
      row.kind === WORLD_SOUND_KIND_MELEE_WEAPON_SWING ||
      row.kind === WORLD_SOUND_KIND_CONSUME_EAT ||
      row.kind === WORLD_SOUND_KIND_CONSUME_DRINK ||
      row.kind === WORLD_SOUND_KIND_ELEVATOR_FLOOR_BUTTON ||
      row.kind === WORLD_SOUND_KIND_ELEVATOR_LANDING_HAIL ||
      row.kind === WORLD_SOUND_KIND_LANDING_EXTERIOR_DOOR_OPEN ||
      row.kind === WORLD_SOUND_KIND_LANDING_EXTERIOR_DOOR_CLOSE
    ) {
      src.playbackRate.value = 0.99 + Math.random() * 0.04;
    }
    src.connect(dry);
    dry.connect(panner);
    panner.connect(out);
    src.start(t);
  }

  private async decodeItemPickBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
    return this.decodeSingleStem(ctx, ITEM_PICK_STEM);
  }

  private async decodeSingleStem(
    ctx: AudioContext,
    stem: string,
    extensions: readonly string[] = AUDIO_EXTENSIONS,
  ): Promise<AudioBuffer | null> {
    const url = await this.resolveSource(stem, extensions);
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

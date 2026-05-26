import type { DbConnection } from "../../module_bindings";
import type { WorldNpc } from "../../module_bindings/types";
import {
  npcLocomotionFromServerByte,
  type NpcArchetypeId,
  type ReplicatedNpcSnapshot,
} from "@the-mammoth/game";
import { BABUSHKA_NPC_DEATH_CLIP_SEC, WorldNpcPresenterPool } from "@the-mammoth/engine";
import type * as THREE from "three";
import type { WorldSoundEvent } from "../../module_bindings/types";
import { createFpBloodBurstFx, type FpBloodBurstFx } from "../fpSession/fpBloodBurstFx.js";
import {
  WORLD_SOUND_FLESH_IMPACT_VAR_HEADSHOT,
  WORLD_SOUND_KIND_MELEE_FLESH_HIT,
} from "../audio/worldProximityAudio.js";
import {
  isFpDebugGameplayFeedbackEnabled,
  subscribeFpDebugGameplayFeedback,
} from "../fpDebugGameplayFeedback.js";
import {
  babushkaIdleNextAtMs,
  createBabushkaNpcAudio,
  rollBabushkaEpitaphOnDeath,
} from "./babushkaNpcAudio.js";
import { createBabushkaCombatAudio } from "./babushkaCombatAudio.js";
import {
  createFpBabushkaSporeBurstFx,
  type FpBabushkaSporeBurstFx,
} from "./fpBabushkaSporeBurstFx.js";
import type { FpNpcCollisionSource } from "../fpPhysics/fpNpcCollision.js";

/** Matches `apps/server/src/npc.rs` `NPC_STATE_IDLE`. */
const NPC_STATE_IDLE = 0;

const TORSO_Y_ABOVE_FEET_M = 1.04;
const MIN_NPC_HIT_BLOOD_DAMAGE = 1;
const BABUSHKA_HIT_VOLUME = 1.15;
const BABUSHKA_SPORE_TRAIL_INTERVAL_MS = 120;
const BABUSHKA_SPORE_TRAIL_MIN_SPEED_SQ = 0.08 * 0.08;
const BABUSHKA_SPORE_TRAIL_BACKSTEP_M = 0.34;

function archetypeFromRow(archetype: string): NpcArchetypeId | null {
  if (archetype === "babushka") return "babushka";
  return null;
}

function snapshotFromRow(row: WorldNpc, observedTimeMs: number): ReplicatedNpcSnapshot | null {
  const archetype = archetypeFromRow(row.archetype);
  if (!archetype) return null;
  return {
    npcId: row.npcId,
    archetype,
    worldPosition: { x: row.x, y: row.y, z: row.z },
    yawRad: row.yaw,
    velocity: { x: row.velX, y: 0, z: row.velZ },
    grounded: row.grounded !== 0,
    locomotion: npcLocomotionFromServerByte(row.locomotion),
    state: row.state,
    health: row.health,
    maxHealth: row.maxHealth,
    meleePresentationSeq: row.meleePresentationSeq,
    hitPresentationSeq: row.hitPresentationSeq,
    observedTimeMs,
  };
}

type NpcAudioTrack = {
  state: number;
  hitSeq: number;
  meleeSeq: number;
  health: number;
};

type BabushkaIdleAudioTrack = {
  nextAtMs: number;
  lastClipIndex: number;
};

export type FpNpcSession = {
  update: (dt: number, nowMs: number) => void;
  dispose: () => void;
};

export type CreateFpNpcSessionOpts = {
  worldParent: THREE.Object3D;
  fxScene: THREE.Scene;
  conn: DbConnection;
  getAudioContext: () => AudioContext | null;
  getCamera: () => THREE.Camera;
  getReadableEnvTexture?: () => THREE.Texture | null;
  /** When set, only replicate rows whose `sessionKey` starts with this prefix. */
  sessionKeyPrefix?: string;
  getRenderPvsGate?: () => ((snap: ReplicatedNpcSnapshot) => boolean) | null;
  /** Shared authoritative NPC capsule blockers for FP locomotion. */
  npcCollision?: FpNpcCollisionSource;
};

export async function createFpNpcSession(opts: CreateFpNpcSessionOpts): Promise<FpNpcSession> {
  const pool = new WorldNpcPresenterPool(opts.worldParent);
  pool.setEnvTextureProvider(opts.getReadableEnvTexture ?? null);
  const syncHitDebugVolumes = (): void => {
    pool.setShowHitDebugVolumes(isFpDebugGameplayFeedbackEnabled("npcHitDebugVolumes"));
  };
  const syncDetectionDebug = (): void => {
    pool.setShowDetectionRadiusDebug(
      isFpDebugGameplayFeedbackEnabled("npcDetectionRadiusDebug"),
    );
    pool.setShowVisionConeDebug(isFpDebugGameplayFeedbackEnabled("npcVisionConeDebug"));
  };
  syncHitDebugVolumes();
  syncDetectionDebug();
  const unsubHitDebug = subscribeFpDebugGameplayFeedback(syncHitDebugVolumes);
  const unsubDetectionDebug = subscribeFpDebugGameplayFeedback(syncDetectionDebug);
  await pool.ensureReady();

  const bloodFx: FpBloodBurstFx = createFpBloodBurstFx(opts.fxScene);
  const sporeFx: FpBabushkaSporeBurstFx = createFpBabushkaSporeBurstFx(opts.fxScene);
  const combatAudio = createBabushkaCombatAudio();
  const babushkaVoice = createBabushkaNpcAudio();
  const rows = new Map<string, WorldNpc>();
  const audioTrack = new Map<string, NpcAudioTrack>();
  const idleAudioTrack = new Map<string, BabushkaIdleAudioTrack>();
  const sporeTrailNextAtMs = new Map<string, number>();
  let lastEpitaphClipIndex = -1;
  let audioLoadStarted = false;
  let snapshotsDirty = true;
  const epitaphTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const clearEpitaphTimer = (npcKey: string): void => {
    const timer = epitaphTimers.get(npcKey);
    if (timer === undefined) return;
    clearTimeout(timer);
    epitaphTimers.delete(npcKey);
  };

  const rowInScope = (row: WorldNpc): boolean =>
    opts.sessionKeyPrefix === undefined || row.sessionKey.startsWith(opts.sessionKeyPrefix);

  const rebuildSnapshots = (nowMs: number): ReplicatedNpcSnapshot[] => {
    const out: ReplicatedNpcSnapshot[] = [];
    for (const row of rows.values()) {
      const snap = snapshotFromRow(row, nowMs);
      if (snap) out.push(snap);
    }
    return out;
  };

  const onRow = (row: WorldNpc) => {
    if (!rowInScope(row)) return;
    const key = row.npcId.toString();
    const prev = audioTrack.get(key);
    const nextTrack: NpcAudioTrack = {
      state: row.state,
      hitSeq: row.hitPresentationSeq,
      meleeSeq: row.meleePresentationSeq,
      health: row.health,
    };
    const ctx = opts.getAudioContext();
    if (prev) {
      const tookDamage = row.hitPresentationSeq > prev.hitSeq;
      if (prev.state === 0 && row.state === 1 && !tookDamage) {
        if (ctx) combatAudio.play(ctx, "aggro");
      }
      if (tookDamage) {
        if (ctx) combatAudio.play(ctx, "hit", BABUSHKA_HIT_VOLUME);
        const damage = Math.max(MIN_NPC_HIT_BLOOD_DAMAGE, prev.health - row.health);
        bloodFx.spawnBurstAt(row.x, row.y + TORSO_Y_ABOVE_FEET_M, row.z, damage);
        sporeFx.spawnBurstAt(row.x, row.y + TORSO_Y_ABOVE_FEET_M, row.z, damage);
      }
      if (row.meleePresentationSeq > prev.meleeSeq) {
        if (ctx) combatAudio.play(ctx, "punch");
      }
      if (prev.health > 0 && row.health <= 0) {
        const deathX = row.x;
        const deathY = row.y;
        const deathZ = row.z;
        if (ctx) {
          combatAudio.play(ctx, "die", 0.85);
          clearEpitaphTimer(key);
          if (rollBabushkaEpitaphOnDeath()) {
            epitaphTimers.set(
              key,
              setTimeout(() => {
                epitaphTimers.delete(key);
                void (async () => {
                  await babushkaVoice.ensureLoaded(ctx);
                  lastEpitaphClipIndex = babushkaVoice.playEpitaph(
                    opts.getCamera(),
                    deathX,
                    deathY,
                    deathZ,
                    lastEpitaphClipIndex,
                  );
                })();
              }, BABUSHKA_NPC_DEATH_CLIP_SEC * 1000),
            );
          }
        }
        idleAudioTrack.delete(key);
      }
    }
    audioTrack.set(key, nextTrack);
    rows.set(key, row);
    snapshotsDirty = true;
    opts.npcCollision?.syncNpcRow({
      npcId: row.npcId,
      archetype: row.archetype,
      x: row.x,
      y: row.y,
      z: row.z,
      state: row.state,
      health: row.health,
    });
  };

  const onDelete = (row: WorldNpc) => {
    if (!rowInScope(row)) return;
    const key = row.npcId.toString();
    clearEpitaphTimer(key);
    rows.delete(key);
    audioTrack.delete(key);
    idleAudioTrack.delete(key);
    sporeTrailNextAtMs.delete(key);
    snapshotsDirty = true;
    opts.npcCollision?.removeNpc(row.npcId);
  };

  const onInsertCb = (_ctx: unknown, row: WorldNpc) => onRow(row);
  const onUpdateCb = (_ctx: unknown, _old: WorldNpc, row: WorldNpc) => onRow(row);
  const onDeleteCb = (_ctx: unknown, row: WorldNpc) => onDelete(row);

  opts.conn.db.world_npc.onInsert(onInsertCb);
  opts.conn.db.world_npc.onUpdate(onUpdateCb);
  opts.conn.db.world_npc.onDelete(onDeleteCb);
  for (const row of opts.conn.db.world_npc.iter()) {
    onRow(row);
  }

  const onFleshImpact = (_ctx: unknown, row: WorldSoundEvent) => {
    if (row.kind !== WORLD_SOUND_KIND_MELEE_FLESH_HIT) return;
    pool.flashHitDebugAtWorld(
      row.x,
      row.y,
      row.z,
      row.variation === WORLD_SOUND_FLESH_IMPACT_VAR_HEADSHOT,
    );
  };
  opts.conn.db.world_sound_event.onInsert(onFleshImpact);

  return {
    update(dt, nowMs) {
      bloodFx.tick(nowMs, dt);
      sporeFx.tick(nowMs, dt);
      const ctx = opts.getAudioContext();
      if (ctx && !audioLoadStarted) {
        audioLoadStarted = true;
        void combatAudio.ensureLoaded(ctx);
        void babushkaVoice.ensureLoaded(ctx);
      }
      const camera = opts.getCamera();
      for (const row of rows.values()) {
        if (archetypeFromRow(row.archetype) !== "babushka") continue;
        const key = row.npcId.toString();
        const speedSq = row.velX * row.velX + row.velZ * row.velZ;
        if (row.health > 0 && speedSq >= BABUSHKA_SPORE_TRAIL_MIN_SPEED_SQ) {
          const nextTrailAt = sporeTrailNextAtMs.get(key) ?? 0;
          if (nowMs >= nextTrailAt) {
            const invSpeed = 1 / Math.sqrt(speedSq);
            sporeFx.spawnTrailAt(
              row.x - row.velX * invSpeed * BABUSHKA_SPORE_TRAIL_BACKSTEP_M,
              row.y + TORSO_Y_ABOVE_FEET_M * 0.78,
              row.z - row.velZ * invSpeed * BABUSHKA_SPORE_TRAIL_BACKSTEP_M,
              nowMs,
            );
            sporeTrailNextAtMs.set(key, nowMs + BABUSHKA_SPORE_TRAIL_INTERVAL_MS);
          }
        } else {
          sporeTrailNextAtMs.delete(key);
        }
        if (row.state !== NPC_STATE_IDLE || row.health <= 0) continue;
        let idleTrack = idleAudioTrack.get(key);
        if (!idleTrack) {
          idleTrack = {
            nextAtMs: babushkaIdleNextAtMs(nowMs, row.npcId),
            lastClipIndex: -1,
          };
          idleAudioTrack.set(key, idleTrack);
        }
        if (nowMs < idleTrack.nextAtMs) continue;
        idleTrack.lastClipIndex = babushkaVoice.tryPlayIdle(
          camera,
          row.x,
          row.y,
          row.z,
          idleTrack.lastClipIndex,
        );
        idleTrack.nextAtMs = babushkaIdleNextAtMs(nowMs, row.npcId);
      }
      const snapshots = rebuildSnapshots(nowMs);
      if (snapshotsDirty) {
        pool.ingestAuthoritative(snapshots);
        snapshotsDirty = false;
      }
      pool.setRenderPvsGate(opts.getRenderPvsGate?.() ?? null);
      pool.tickVisual(snapshots, dt);
    },
    dispose() {
      for (const timer of epitaphTimers.values()) {
        clearTimeout(timer);
      }
      epitaphTimers.clear();
      unsubHitDebug();
      unsubDetectionDebug();
      opts.conn.db.world_sound_event.removeOnInsert(onFleshImpact);
      opts.conn.db.world_npc.removeOnInsert(onInsertCb);
      opts.conn.db.world_npc.removeOnUpdate(onUpdateCb);
      opts.conn.db.world_npc.removeOnDelete(onDeleteCb);
      bloodFx.dispose();
      sporeFx.dispose();
      pool.dispose();
      rows.clear();
      opts.npcCollision?.clear();
      audioTrack.clear();
      idleAudioTrack.clear();
      sporeTrailNextAtMs.clear();
    },
  };
}

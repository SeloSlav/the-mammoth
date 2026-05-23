import type { DbConnection } from "../../module_bindings";
import type { WorldNpc } from "../../module_bindings/types";
import {
  npcLocomotionFromServerByte,
  type NpcArchetypeId,
  type ReplicatedNpcSnapshot,
} from "@the-mammoth/game";
import { WorldNpcPresenterPool } from "@the-mammoth/engine";

const NPC_STATE_DEAD = 2;

const BABUSHKA_AUDIO = {
  aggro: "/audio/npc/babushka-aggro.wav",
  hit: "/audio/npc/babushka-hit.wav",
  punch: "/audio/npc/babushka-punch.wav",
  die: "/audio/npc/babushka-die.wav",
} as const;

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

function playNpcOneShot(
  audioContext: AudioContext | null,
  url: string,
  volume = 0.85,
): void {
  if (!audioContext) return;
  void fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => audioContext.decodeAudioData(buf))
    .then((decoded) => {
      const src = audioContext.createBufferSource();
      src.buffer = decoded;
      const gain = audioContext.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(audioContext.destination);
      src.start();
    })
    .catch(() => {
      /* optional assets during dev */
    });
}

type NpcAudioTrack = {
  state: number;
  hitSeq: number;
  meleeSeq: number;
  health: number;
};

export type FpNpcSession = {
  update: (dt: number, nowMs: number) => void;
  dispose: () => void;
};

export function createFpNpcSession(opts: {
  scene: import("three").Scene;
  conn: DbConnection;
  getAudioContext: () => AudioContext | null;
}): FpNpcSession {
  const pool = new WorldNpcPresenterPool(opts.scene);
  void pool.ensureReady();

  const rows = new Map<string, WorldNpc>();
  const audioTrack = new Map<string, NpcAudioTrack>();

  const rebuildSnapshots = (nowMs: number): ReplicatedNpcSnapshot[] => {
    const out: ReplicatedNpcSnapshot[] = [];
    for (const row of rows.values()) {
      const snap = snapshotFromRow(row, nowMs);
      if (snap) out.push(snap);
    }
    return out;
  };

  const onRow = (row: WorldNpc) => {
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
      if (prev.state === 0 && row.state === 1) {
        playNpcOneShot(ctx, BABUSHKA_AUDIO.aggro);
      }
      if (row.hitPresentationSeq > prev.hitSeq) {
        playNpcOneShot(ctx, BABUSHKA_AUDIO.hit);
      }
      if (row.meleePresentationSeq > prev.meleeSeq) {
        playNpcOneShot(ctx, BABUSHKA_AUDIO.punch);
      }
      if (prev.health > 0 && row.health <= 0) {
        playNpcOneShot(ctx, BABUSHKA_AUDIO.die);
      }
    }
    audioTrack.set(key, nextTrack);
    rows.set(key, row);
  };

  const onDelete = (row: WorldNpc) => {
    const key = row.npcId.toString();
    rows.delete(key);
    audioTrack.delete(key);
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

  return {
    update(dt, nowMs) {
      pool.sync(rebuildSnapshots(nowMs), dt);
    },
    dispose() {
      opts.conn.db.world_npc.removeOnInsert(onInsertCb);
      opts.conn.db.world_npc.removeOnUpdate(onUpdateCb);
      opts.conn.db.world_npc.removeOnDelete(onDeleteCb);
      pool.dispose();
      rows.clear();
      audioTrack.clear();
    },
  };
}

export async function enterCombatSim(conn: DbConnection): Promise<void> {
  await conn.reducers.enterCombatSim({});
}

import type { DbConnection } from "../../module_bindings";
import type { WorldNpc } from "../../module_bindings/types";
import {
  npcLocomotionFromServerByte,
  type NpcArchetypeId,
  type ReplicatedNpcSnapshot,
} from "@the-mammoth/game";
import { WorldNpcPresenterPool } from "@the-mammoth/engine";
import * as THREE from "three";
import { createFpBloodBurstFx, type FpBloodBurstFx } from "../fpSession/fpBloodBurstFx.js";

const NPC_STATE_DEAD = 2;
const TORSO_Y_ABOVE_FEET_M = 1.04;
const MIN_NPC_HIT_BLOOD_DAMAGE = 1;
const LOCAL_DEBUG_PROXY_HEIGHT_M = 1.55;
const LOCAL_DEBUG_PROXY_RADIUS_M = 0.3;

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
  if (row.state === NPC_STATE_DEAD) return null;
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

function createClientNpcProxy(): THREE.Group {
  const root = new THREE.Group();
  root.name = "client_world_npc_visible_proxy";
  root.renderOrder = 10_000;

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(
      LOCAL_DEBUG_PROXY_RADIUS_M,
      LOCAL_DEBUG_PROXY_HEIGHT_M - LOCAL_DEBUG_PROXY_RADIUS_M * 2,
      8,
      16,
    ),
    new THREE.MeshBasicMaterial({
      color: 0xff2a1f,
      toneMapped: false,
    }),
  );
  body.name = "client_world_npc_visible_proxy_body";
  body.position.y = LOCAL_DEBUG_PROXY_HEIGHT_M * 0.5;
  body.frustumCulled = false;
  body.renderOrder = 10_000;
  root.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffff00,
      toneMapped: false,
    }),
  );
  head.name = "client_world_npc_visible_proxy_head";
  head.position.y = LOCAL_DEBUG_PROXY_HEIGHT_M + 0.15;
  head.frustumCulled = false;
  head.renderOrder = 10_001;
  root.add(head);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 5.0, 8),
    new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.8,
      toneMapped: false,
    }),
  );
  beacon.name = "client_world_npc_visible_proxy_beacon";
  beacon.position.y = 2.5;
  beacon.frustumCulled = false;
  beacon.renderOrder = 10_002;
  root.add(beacon);

  return root;
}

function syncClientNpcProxy(
  parent: THREE.Object3D,
  proxies: Map<string, THREE.Group>,
  snapshots: readonly ReplicatedNpcSnapshot[],
): void {
  const live = new Set<string>();
  for (const snap of snapshots) {
    const key = snap.npcId.toString();
    live.add(key);
    let proxy = proxies.get(key);
    if (!proxy) {
      proxy = createClientNpcProxy();
      proxies.set(key, proxy);
      parent.add(proxy);
    }
    proxy.visible = true;
    proxy.position.set(snap.worldPosition.x, snap.worldPosition.y, snap.worldPosition.z);
    proxy.rotation.y = snap.yawRad + Math.PI;
  }
  for (const [key, proxy] of proxies) {
    if (!live.has(key)) {
      parent.remove(proxy);
      proxy.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat) => mat.dispose());
        } else {
          obj.material.dispose();
        }
      });
      proxies.delete(key);
    }
  }
}

export type FpNpcSession = {
  update: (dt: number, nowMs: number) => void;
  dispose: () => void;
};

export type CreateFpNpcSessionOpts = {
  worldParent: THREE.Object3D;
  fxScene: THREE.Scene;
  conn: DbConnection;
  getAudioContext: () => AudioContext | null;
  getReadableEnvTexture?: () => THREE.Texture | null;
  /** When set, only replicate rows whose `sessionKey` starts with this prefix. */
  sessionKeyPrefix?: string;
};

export async function createFpNpcSession(opts: CreateFpNpcSessionOpts): Promise<FpNpcSession> {
  const pool = new WorldNpcPresenterPool(opts.worldParent);
  pool.setEnvTextureProvider(opts.getReadableEnvTexture ?? null);
  await pool.ensureReady();

  const bloodFx: FpBloodBurstFx = createFpBloodBurstFx(opts.fxScene);
  const rows = new Map<string, WorldNpc>();
  const audioTrack = new Map<string, NpcAudioTrack>();
  const clientVisibleProxies = new Map<string, THREE.Group>();

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
      if (prev.state === 0 && row.state === 1) {
        playNpcOneShot(ctx, BABUSHKA_AUDIO.aggro);
      }
      if (row.hitPresentationSeq > prev.hitSeq) {
        playNpcOneShot(ctx, BABUSHKA_AUDIO.hit);
        const damage = Math.max(MIN_NPC_HIT_BLOOD_DAMAGE, prev.health - row.health);
        bloodFx.spawnBurstAt(row.x, row.y + TORSO_Y_ABOVE_FEET_M, row.z, damage);
      }
      if (row.meleePresentationSeq > prev.meleeSeq) {
        playNpcOneShot(ctx, BABUSHKA_AUDIO.punch);
      }
      if (prev.health > 0 && row.health <= 0) {
        playNpcOneShot(ctx, BABUSHKA_AUDIO.die);
      }
    }
    audioTrack.set(key, nextTrack);
    if (row.state === NPC_STATE_DEAD) {
      rows.delete(key);
      audioTrack.delete(key);
      const snapshots = rebuildSnapshots(performance.now());
      syncClientNpcProxy(opts.worldParent, clientVisibleProxies, snapshots);
      pool.sync(snapshots, 0);
      return;
    }
    rows.set(key, row);
    const snapshots = rebuildSnapshots(performance.now());
    syncClientNpcProxy(opts.worldParent, clientVisibleProxies, snapshots);
    pool.sync(snapshots, 0);
  };

  const onDelete = (row: WorldNpc) => {
    if (!rowInScope(row)) return;
    const key = row.npcId.toString();
    rows.delete(key);
    audioTrack.delete(key);
    const snapshots = rebuildSnapshots(performance.now());
    syncClientNpcProxy(opts.worldParent, clientVisibleProxies, snapshots);
    pool.sync(snapshots, 0);
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
  const initialSnapshots = rebuildSnapshots(performance.now());
  syncClientNpcProxy(opts.worldParent, clientVisibleProxies, initialSnapshots);
  pool.sync(initialSnapshots, 0);

  return {
    update(dt, nowMs) {
      bloodFx.tick(nowMs, dt);
      const snapshots = rebuildSnapshots(nowMs);
      syncClientNpcProxy(opts.worldParent, clientVisibleProxies, snapshots);
      pool.sync(snapshots, dt);
    },
    dispose() {
      opts.conn.db.world_npc.removeOnInsert(onInsertCb);
      opts.conn.db.world_npc.removeOnUpdate(onUpdateCb);
      opts.conn.db.world_npc.removeOnDelete(onDeleteCb);
      bloodFx.dispose();
      pool.dispose();
      syncClientNpcProxy(opts.worldParent, clientVisibleProxies, []);
      rows.clear();
      audioTrack.clear();
    },
  };
}

export async function enterCombatSim(conn: DbConnection): Promise<void> {
  await conn.reducers.enterCombatSim({});
}

/**
 * Babushka NPC voice — idle mumbles (spatial, while non-aggro) and death epitaphs.
 * Combat one-shots (aggro/hit/punch/die) stay in `fpNpcSession.ts`.
 * Assets are MP3 from ElevenLabs under `public/audio/npc/`.
 */

import * as THREE from "three";
import { worldSoundVirtualPannerPosition } from "../audio/worldProximityMetric.js";

const AUDIO_ROOT = `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/audio`;
const NPC_STEM = `${AUDIO_ROOT}/npc` as const;

/** Add stems here as you export more ElevenLabs clips; missing files are skipped at load. */
export const BABUSHKA_IDLE_STEMS = [
  `${NPC_STEM}/babushka-idle`,
  `${NPC_STEM}/babushka-idle-2`,
  `${NPC_STEM}/babushka-idle-3`,
  `${NPC_STEM}/babushka-idle-4`,
] as const;

export const BABUSHKA_EPITAPH_STEMS = [
  `${NPC_STEM}/babushka-epitaph-1`,
  `${NPC_STEM}/babushka-epitaph-2`,
  `${NPC_STEM}/babushka-epitaph-3`,
] as const;

const MEDIA_EXTENSIONS = ["mp3"] as const;

const IDLE_MIN_INTERVAL_SEC = 12;
const IDLE_MAX_INTERVAL_SEC = 24;
const IDLE_HEAR_MAX_M = 13;
const IDLE_VOLUME = 0.5;
const IDLE_REF_DISTANCE_M = 0.55;
const IDLE_ROLLOFF = 1.35;

const EPITAPH_VOLUME = 0.78;
const EPITAPH_MAX_DISTANCE_M = 14;
const EPITAPH_REF_DISTANCE_M = 0.65;
const EPITAPH_ROLLOFF = 1.1;

const VOICE_BUS_GAIN = 0.92;
const PLAYBACK_JITTER = 0.04;
const PLAYBACK_MIN = 0.96;
const PLAYBACK_MAX = 1.05;

const TORSO_Y_ABOVE_FEET_M = 1.04;

/** Pick a random index; when pool > 1, never repeat `excludeIndex`. */
export function pickRandomClipIndex(poolLength: number, excludeIndex: number): number {
  if (poolLength <= 0) return 0;
  if (poolLength === 1) return 0;
  let idx = Math.floor(Math.random() * poolLength);
  if (idx === excludeIndex) {
    idx = (idx + 1) % poolLength;
  }
  return idx;
}

export function babushkaIdleNextAtMs(nowMs: number, npcId: bigint | number): number {
  const salt = Number(npcId) % 97;
  const spanSec = IDLE_MAX_INTERVAL_SEC - IDLE_MIN_INTERVAL_SEC;
  const jitterSec = IDLE_MIN_INTERVAL_SEC + Math.random() * spanSec + salt * 0.07;
  return nowMs + jitterSec * 1000;
}

type StemPool = {
  buffers: AudioBuffer[];
};

async function decodeStem(ctx: AudioContext, stem: string): Promise<AudioBuffer | null> {
  for (const ext of MEDIA_EXTENSIONS) {
    const url = `${stem}.${ext}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      return await ctx.decodeAudioData(ab.slice(0));
    } catch {
      // try next extension
    }
  }
  return null;
}

async function loadStemPool(ctx: AudioContext, stems: readonly string[]): Promise<StemPool> {
  const buffers: AudioBuffer[] = [];
  for (const stem of stems) {
    const buf = await decodeStem(ctx, stem);
    if (buf) buffers.push(buf);
  }
  return { buffers };
}

function syncListenerFromCamera(ctx: AudioContext, camera: THREE.Camera): void {
  camera.updateMatrixWorld(true);
  const m = camera.matrixWorld.elements;
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

function playSpatialBuffer(
  ctx: AudioContext,
  camera: THREE.Camera,
  out: GainNode,
  buffer: AudioBuffer,
  worldX: number,
  worldY: number,
  worldZ: number,
  volume: number,
  refDistanceM: number,
  maxDistanceM: number,
  rolloffFactor: number,
): void {
  syncListenerFromCamera(ctx, camera);

  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const lx = camPos.x;
  const ly = camPos.y;
  const lz = camPos.z;
  const dist = Math.hypot(worldX - lx, worldY - ly, worldZ - lz);
  if (dist > maxDistanceM * 1.05) return;

  const pan = worldSoundVirtualPannerPosition(lx, ly, lz, worldX, worldY, worldZ, dist);
  const t = ctx.currentTime;

  const dry = ctx.createGain();
  dry.gain.value = volume;

  const panner = ctx.createPanner();
  try {
    panner.panningModel = "HRTF";
  } catch {
    panner.panningModel = "equalpower";
  }
  panner.distanceModel = "inverse";
  panner.refDistance = refDistanceM;
  panner.maxDistance = maxDistanceM;
  panner.rolloffFactor = rolloffFactor;
  panner.positionX.setValueAtTime(pan.x, t);
  panner.positionY.setValueAtTime(pan.y, t);
  panner.positionZ.setValueAtTime(pan.z, t);

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value =
    PLAYBACK_MIN + Math.random() * (PLAYBACK_MAX - PLAYBACK_MIN + PLAYBACK_JITTER);
  src.connect(dry);
  dry.connect(panner);
  panner.connect(out);
  src.start(t);
}

export type BabushkaNpcAudio = {
  ensureLoaded: (ctx: AudioContext) => Promise<void>;
  tryPlayIdle: (
    camera: THREE.Camera,
    npcX: number,
    npcY: number,
    npcZ: number,
    lastClipIndex: number,
  ) => number;
  playEpitaph: (
    camera: THREE.Camera,
    npcX: number,
    npcY: number,
    npcZ: number,
    lastClipIndex: number,
  ) => number;
};

export function createBabushkaNpcAudio(): BabushkaNpcAudio {
  let ctx: AudioContext | null = null;
  let voiceGain: GainNode | null = null;
  let idlePool: StemPool = { buffers: [] };
  let epitaphPool: StemPool = { buffers: [] };
  let loadPromise: Promise<void> | null = null;

  const ensureLoaded = async (audioCtx: AudioContext): Promise<void> => {
    if (loadPromise && ctx === audioCtx) {
      await loadPromise;
      return;
    }
    ctx = audioCtx;
    loadPromise = (async () => {
      idlePool = await loadStemPool(audioCtx, BABUSHKA_IDLE_STEMS);
      epitaphPool = await loadStemPool(audioCtx, BABUSHKA_EPITAPH_STEMS);
      if (!voiceGain) {
        const g = audioCtx.createGain();
        g.gain.value = VOICE_BUS_GAIN;
        g.connect(audioCtx.destination);
        voiceGain = g;
      }
    })();
    await loadPromise;
  };

  const tryPlayIdle = (
    camera: THREE.Camera,
    npcX: number,
    npcY: number,
    npcZ: number,
    lastClipIndex: number,
  ): number => {
    const audioCtx = ctx;
    const out = voiceGain;
    const { buffers } = idlePool;
    if (!audioCtx || !out || buffers.length === 0) return lastClipIndex;

    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const dist = Math.hypot(npcX - camPos.x, npcY - camPos.y, npcZ - camPos.z);
    if (dist > IDLE_HEAR_MAX_M) return lastClipIndex;

    const idx = pickRandomClipIndex(buffers.length, lastClipIndex);
    playSpatialBuffer(
      audioCtx,
      camera,
      out,
      buffers[idx]!,
      npcX,
      npcY + TORSO_Y_ABOVE_FEET_M,
      npcZ,
      IDLE_VOLUME,
      IDLE_REF_DISTANCE_M,
      IDLE_HEAR_MAX_M,
      IDLE_ROLLOFF,
    );
    return idx;
  };

  const playEpitaph = (
    camera: THREE.Camera,
    npcX: number,
    npcY: number,
    npcZ: number,
    lastClipIndex: number,
  ): number => {
    const audioCtx = ctx;
    const out = voiceGain;
    const { buffers } = epitaphPool;
    if (!audioCtx || !out || buffers.length === 0) return lastClipIndex;

    const idx = pickRandomClipIndex(buffers.length, lastClipIndex);
    playSpatialBuffer(
      audioCtx,
      camera,
      out,
      buffers[idx]!,
      npcX,
      npcY + TORSO_Y_ABOVE_FEET_M,
      npcZ,
      EPITAPH_VOLUME,
      EPITAPH_REF_DISTANCE_M,
      EPITAPH_MAX_DISTANCE_M,
      EPITAPH_ROLLOFF,
    );
    return idx;
  };

  return { ensureLoaded, tryPlayIdle, playEpitaph };
}

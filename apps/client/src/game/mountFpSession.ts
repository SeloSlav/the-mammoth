import * as THREE from "three";
import type { DbConnection } from "../module_bindings";
import type { PlayerPose } from "../module_bindings/types";
import {
  createFPRig,
  createFpLocomotionState,
  fpLocomotionConstants,
  queueFpJump,
  stepFpLocomotion,
  type FpLocomotionInput,
} from "@the-mammoth/engine";
import {
  buildCellMeshes,
  buildFloorMeshes,
  parseCellDoc,
  parseFloorDoc,
} from "@the-mammoth/world";
import floorDoc from "../../../../content/building/floors/floor_01_east.json";
import cellDoc from "../../../../content/cells/cell_0_0.json";
import { encodeMoveIntentBits } from "./moveIntentCodec";
import { PoseInterpBuffer } from "./poseInterpBuffer";

/** Intent publish cadence (aligned with ~20 Hz server tick feel). */
const NET_INTERVAL_MS = 50;
const MOUSE_SENS = 0.0022;
const PITCH_LIMIT = 1.38;

type LastXZ = { x: number; z: number; t: number };

function poseSeqAsBigint(seq: PlayerPose["seq"]): bigint {
  return typeof seq === "bigint" ? seq : BigInt(seq as number);
}

function feedRemote(
  interp: PoseInterpBuffer,
  id: string,
  row: PlayerPose,
  last: Map<string, LastXZ>,
): void {
  const prev = last.get(id);
  const now = performance.now();
  const dt = prev ? Math.max((now - prev.t) / 1000, 0.016) : 0.034;
  const vx = prev ? (row.x - prev.x) / dt : 0;
  const vz = prev ? (row.z - prev.z) / dt : 0;
  last.set(id, { x: row.x, z: row.z, t: now });
  interp.push(id, row.x, row.y, row.z, vx, vz);
}

/**
 * First-person session: authored floor + sample cell, SpaceTimeDB `player_pose` sync,
 * capsule proxies for other players (interpolation buffer on remotes).
 *
 * **Local player (prototype):** client sim is **display authority**; we publish poses for
 * persistence and for **other clients**. We do **not** blend toward our own replica every
 * frame (that fights prediction). We only **rubber-band** if we are meters out of sync
 * (teleport / bad connection). Production MMORPG path: intent reducers + server sim tick
 * + shared constants (see team docs / chat).
 */
export function mountFpSession(
  canvas: HTMLCanvasElement,
  conn: DbConnection,
): () => void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3d4455);

  const { rig: playerRig, headPivot, camera } = createFPRig(
    fpLocomotionConstants.eyeStand,
  );
  scene.add(playerRig);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  const floorRoot = buildFloorMeshes(parseFloorDoc(floorDoc));
  scene.add(floorRoot);
  const cellRoot = buildCellMeshes(parseCellDoc(cellDoc));
  scene.add(cellRoot);

  const hemi = new THREE.HemisphereLight(0xc8d4f0, 0x5a5e68, 1.05);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff5e6, 0.72);
  dir.position.set(8, 18, 6);
  scene.add(dir);
  const fill = new THREE.AmbientLight(0xa8b4d0, 0.42);
  scene.add(fill);

  const interp = new PoseInterpBuffer();
  const lastRemote = new Map<string, LastXZ>();
  const pills = new Map<string, THREE.Object3D>();
  const capsuleGeo = new THREE.CapsuleGeometry(0.35, 0.95, 6, 10);
  const capMatOther = new THREE.MeshStandardMaterial({ color: 0x9f7a6b });

  const pos = new THREE.Vector3(0, 1, 6);
  let yaw = 0;
  let pitch = 0;
  /** Monotonic intent id; server rejects non-increasing `intent_seq`. */
  let intentSeq = 0n;
  let lastNet = 0;

  const keys = new Set<string>();
  let crouchToggle = false;
  const loco = createFpLocomotionState();

  /** Replicated pose for rubber-banding (local display does not follow this each frame). */
  const serverPose = { x: 0, y: 1, z: 6 };
  let spawnSynced = false;
  const RUBBER_BAND_SNAP_M = 2.8;

  const ingestPose = (row: PlayerPose) => {
    const id = row.identity.toHexString();
    const self = conn.identity?.isEqual(row.identity) ?? false;
    if (self) {
      serverPose.x = row.x;
      serverPose.y = row.y;
      serverPose.z = row.z;
      if (!spawnSynced) {
        pos.set(row.x, row.y, row.z);
        yaw = row.yaw;
        spawnSynced = true;
      }
      const serverSeq = poseSeqAsBigint(row.seq);
      if (serverSeq > intentSeq) intentSeq = serverSeq;
      return;
    }
    feedRemote(interp, id, row, lastRemote);
    let mesh = pills.get(id);
    if (!mesh) {
      const cap = new THREE.Mesh(capsuleGeo, capMatOther);
      cap.castShadow = true;
      mesh = cap;
      mesh.name = `player:${id}`;
      scene.add(mesh);
      pills.set(id, mesh);
    }
  };

  const syncAllPoses = () => {
    for (const row of conn.db.player_pose) {
      ingestPose(row as PlayerPose);
    }
  };

  const onPoseInsert = (_ctx: unknown, row: PlayerPose) => {
    ingestPose(row);
  };
  const onPoseUpdate = (_ctx: unknown, _old: PlayerPose, row: PlayerPose) => {
    ingestPose(row);
  };

  conn.db.player_pose.onInsert(onPoseInsert);
  conn.db.player_pose.onUpdate(onPoseUpdate);
  syncAllPoses();

  const setSize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  setSize();
  const ro = new ResizeObserver(setSize);
  ro.observe(canvas);

  const sendMoveIntent = (input: FpLocomotionInput, jump: boolean) => {
    if (!conn.identity) return;
    intentSeq += 1n;
    const bits = encodeMoveIntentBits(input, jump);
    void conn.reducers.submitMoveIntent({
      intentSeq,
      bits,
      aimYaw: yaw,
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (e.code === "Escape") void document.exitPointerLock();
    if (e.code === "KeyC" && !e.repeat) crouchToggle = !crouchToggle;
    if (e.code === "Space" && !e.repeat) {
      queueFpJump(loco);
      const input: FpLocomotionInput = {
        forward: keys.has("KeyW"),
        backward: keys.has("KeyS"),
        left: keys.has("KeyA"),
        right: keys.has("KeyD"),
        sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        crouch: crouchToggle,
      };
      sendMoveIntent(input, true);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * MOUSE_SENS;
    pitch -= e.movementY * MOUSE_SENS;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  };

  const onClick = () => {
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("click", onClick);

  let raf = 0;
  let lastFrameMs = performance.now();

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const nowMs = performance.now();
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.05);
    lastFrameMs = nowMs;

    const input: FpLocomotionInput = {
      forward: keys.has("KeyW"),
      backward: keys.has("KeyS"),
      left: keys.has("KeyA"),
      right: keys.has("KeyD"),
      sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
      crouch: crouchToggle,
    };
    const jumpQueuedBeforeStep = loco.jumpQueued;
    const headY = stepFpLocomotion(loco, pos, yaw, input, dt);

    const desync = Math.hypot(
      pos.x - serverPose.x,
      pos.y - serverPose.y,
      pos.z - serverPose.z,
    );
    if (desync > RUBBER_BAND_SNAP_M) {
      pos.set(serverPose.x, serverPose.y, serverPose.z);
      loco.velocity.set(0, 0, 0);
    }

    playerRig.position.set(pos.x, pos.y, pos.z);
    playerRig.rotation.y = yaw;
    headPivot.position.y = headY;
    headPivot.rotation.x = pitch;
    headPivot.rotation.y = 0;

    const now = performance.now();
    if (now - lastNet >= NET_INTERVAL_MS && conn.identity) {
      lastNet = now;
      sendMoveIntent(input, jumpQueuedBeforeStep);
    }

    const keep = new Set<string>();
    if (conn.identity) keep.add(conn.identity.toHexString());
    for (const row of conn.db.player_pose) {
      const id = row.identity.toHexString();
      keep.add(id);
      if (conn.identity?.isEqual(row.identity)) continue;
      const p = interp.getInterpolated(id, performance.now());
      const mesh = pills.get(id);
      if (p && mesh) {
        mesh.position.set(p.x, p.y + 0.55, p.z);
        mesh.rotation.y = row.yaw;
      }
    }
    for (const [id, mesh] of pills) {
      if (!keep.has(id)) {
        scene.remove(mesh);
        pills.delete(id);
        interp.remove(id);
        lastRemote.delete(id);
      }
    }

    renderer.render(scene, camera);
  };
  tick();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("click", onClick);
    conn.db.player_pose.removeOnInsert(onPoseInsert);
    conn.db.player_pose.removeOnUpdate(onPoseUpdate);
    renderer.dispose();
    scene.clear();
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
  };
}

import * as THREE from "three";
import type { DbConnection } from "../module_bindings";
import type { PlayerPose } from "../module_bindings/types";
import { createFPCamera } from "@the-mammoth/engine";
import {
  buildCellMeshes,
  buildFloorMeshes,
  parseCellDoc,
  parseFloorDoc,
} from "@the-mammoth/world";
import floorDoc from "../../../../content/building/floors/floor_01_east.json";
import cellDoc from "../../../../content/cells/cell_0_0.json";
import { PoseInterpBuffer } from "./poseInterpBuffer";

const MOVE_SPEED = 4.25;
const EYE_OFFSET = 1.55;
const NET_INTERVAL_MS = 45;
const MOUSE_SENS = 0.0022;
const PITCH_LIMIT = 1.38;

type LastXZ = { x: number; z: number; t: number };

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
 * capsule proxies for other players (selo-style interpolation buffer on remotes).
 */
export function mountFpSession(
  canvas: HTMLCanvasElement,
  conn: DbConnection,
): () => void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a22);

  const camera = createFPCamera();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  const floorRoot = buildFloorMeshes(parseFloorDoc(floorDoc));
  scene.add(floorRoot);
  const cellRoot = buildCellMeshes(parseCellDoc(cellDoc));
  scene.add(cellRoot);

  const hemi = new THREE.HemisphereLight(0x9aa0c8, 0x2a2a30, 0.85);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.4);
  dir.position.set(6, 14, 4);
  scene.add(dir);

  const interp = new PoseInterpBuffer();
  const lastRemote = new Map<string, LastXZ>();
  const pills = new Map<string, THREE.Object3D>();
  const capsuleGeo = new THREE.CapsuleGeometry(0.35, 0.95, 6, 10);
  const capMatOther = new THREE.MeshStandardMaterial({ color: 0x9f7a6b });

  const pos = new THREE.Vector3(0, 1, 6);
  let yaw = 0;
  let pitch = 0;
  let seq = 0n;
  let lastNet = 0;

  const keys = new Set<string>();

  const ingestPose = (row: PlayerPose) => {
    const id = row.identity.toHexString();
    const self = conn.identity?.isEqual(row.identity) ?? false;
    if (self) {
      pos.set(row.x, row.y, row.z);
      yaw = row.yaw;
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

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (e.code === "Escape") void document.exitPointerLock();
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

  const clock = new THREE.Clock();
  let raf = 0;

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);

    let mx = 0;
    let mz = 0;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    if (keys.has("KeyW")) {
      mx += forward.x;
      mz += forward.z;
    }
    if (keys.has("KeyS")) {
      mx -= forward.x;
      mz -= forward.z;
    }
    if (keys.has("KeyA")) {
      mx -= right.x;
      mz -= right.z;
    }
    if (keys.has("KeyD")) {
      mx += right.x;
      mz += right.z;
    }
    const len = Math.hypot(mx, mz);
    if (len > 1e-6) {
      mx = (mx / len) * MOVE_SPEED * dt;
      mz = (mz / len) * MOVE_SPEED * dt;
      pos.x += mx;
      pos.z += mz;
    }

    camera.position.set(pos.x, pos.y + EYE_OFFSET, pos.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    const now = performance.now();
    if (now - lastNet >= NET_INTERVAL_MS && conn.identity) {
      lastNet = now;
      seq += 1n;
      void conn.reducers.updatePlayerPose({
        seq,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw,
      });
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

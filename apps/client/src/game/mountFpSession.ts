import * as THREE from "three";
import { and, or } from "spacetimedb";
import type { DbConnection, SubscriptionHandle } from "../module_bindings";
import { tables } from "../module_bindings";
import type { PlayerPose } from "../module_bindings/types";
import {
  createFPRig,
  createFpLocomotionState,
  fpLocomotionConstants,
  queueFpJump,
  stepFpLocomotion,
  PlayerPresentationManager,
  type FpLocomotionInput,
} from "@the-mammoth/engine";
import {
  buildCellMeshes,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  instantiateBuildingFloorStack,
  parseBuildingDoc,
  parseCellDoc,
  parseFloorDoc,
  sampleWalkGroundTopYWithExteriorGround,
  walkSurfaceAabbXZFootprint,
  walkSurfaceAABBsForBuilding,
} from "@the-mammoth/world";
import buildingDoc from "../../../../content/building/mammoth.json";
import cellDoc from "../../../../content/cells/cell_0_0.json";

const floorJsonModules = import.meta.glob<{ default: unknown }>(
  "../../../../content/building/floors/*.json",
  { eager: true },
);

function floorPayloadByDocId(floorDocId: string): unknown {
  const suffix = `/${floorDocId}.json`.replaceAll("\\", "/");
  for (const [path, mod] of Object.entries(floorJsonModules)) {
    if (path.replaceAll("\\", "/").endsWith(suffix)) return mod.default;
  }
  throw new Error(`Missing floor JSON for id "${floorDocId}"`);
}
import { encodeMoveIntentBits } from "./moveIntentCodec";
import { PoseInterpBuffer } from "./poseInterpBuffer";
import { replicatedPlayerSnapshotFromPlainPose } from "@the-mammoth/net";
import { buildLocalPlayerGameplayState } from "./localPlayerGameplay";
import { attachFpSessionEnvironment } from "./fpSessionEnvironment";
import { buildMockRemoteSnapshots } from "./mockRemoteSnapshots";

/**
 * Intent publish cadence — keep near `apps/server/src/movement.rs` physics schedule
 * (`TimeDuration::from_micros(50_000)` ≈ 20 Hz) so prediction and authority stay aligned.
 */
const NET_INTERVAL_MS = 50;

/** Horizontal half-extent (m) of the replicated `player_pose` box (XZ). */
const POSE_AOI_HALF = 42;
/** Recentre AOI when predicted position moves this far from the last subscription anchor (m). */
const POSE_AOI_RECENTER = 14;
const MOUSE_SENS = 0.0022;
/** ~88° — enough to scan hoistway tops without going full flip. */
const PITCH_LIMIT = 1.53;
/** Alt free-look: head yaw relative to body (radians, clamped per side; ~±115°, not full rear). */
const FREE_LOOK_YAW_MAX = 2.0;
/** Extra camera bob on top of eye-height bob from `stepFpLocomotion` (radians / meters). */
const CAM_BOB_ROLL = 0.016;
const CAM_BOB_SWAY_X = 0.012;
const CAM_BOB_DIP_Y = 0.018;

const MELEE_COOLDOWN_MS = 480;

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
 * First-person session: mammoth `BuildingDoc` floor stack + slim cell, SpaceTimeDB `player_pose` sync,
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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const disposeFpEnvironment = attachFpSessionEnvironment(scene, renderer);

  const { rig: playerRig, headPivot, headPitch, headCameraPitch, headFreeLook, camera } =
    createFPRig(fpLocomotionConstants.eyeStand);
  scene.add(playerRig);

  const building = parseBuildingDoc(buildingDoc);
  const walkAABBs = walkSurfaceAABBsForBuilding(
    building,
    (id) => parseFloorDoc(floorPayloadByDocId(id)),
    DEFAULT_BUILDING_FLOOR_SPACING_M,
  );
  const walkFootprint =
    walkSurfaceAabbXZFootprint(walkAABBs) ??
    ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 } as const);
  const sampleWalkTop = (worldX: number, worldZ: number, probeTopY: number) =>
    sampleWalkGroundTopYWithExteriorGround(
      walkAABBs,
      worldX,
      worldZ,
      probeTopY,
      walkFootprint,
      {
        footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
        stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
      },
    );

  const buildingRoot = instantiateBuildingFloorStack(building, (id) =>
    parseFloorDoc(floorPayloadByDocId(id)),
  );
  scene.add(buildingRoot);

  const cellRoot = buildCellMeshes(parseCellDoc(cellDoc));
  scene.add(cellRoot);

  const presentation = new PlayerPresentationManager({
    scene,
    camera,
    fpViewModelParent: headPitch,
    onMeleeVisual: (evt) => {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      void evt;
      void origin;
      void dir;
      // TODO: hand off to gameplay hit-scan / server validation — placeholder trace only.
    },
  });

  const interp = new PoseInterpBuffer();
  const lastRemote = new Map<string, LastXZ>();

  /** Lobby hub (ground floor): near elevators + stairs at z=0 (`floor_mamutica_ground`). */
  const pos = new THREE.Vector3(0, 1.35, 0);
  /** Feet / capsule yaw — sent as `aimYaw` to the server and used for locomotion. */
  let bodyYaw = 0;
  /** Mouse look pitch (head pivot X). */
  let pitch = 0;
  /** Alt free-look yaw on `headFreeLook` only (radians); merged into `bodyYaw` on Alt release. */
  let headLookYaw = 0;
  /** Monotonic intent id; server rejects non-increasing `intent_seq`. */
  let intentSeq = 0n;
  let lastNet = 0;

  const keys = new Set<string>();
  let crouchToggle = false;
  const loco = createFpLocomotionState();

  /**
   * Browsers often skip `keyup` when the tab/window loses focus — keys (including Alt) stay in
   * `keys`, so free-look stays latched and mouse X only drives `headLookYaw` until Alt “releases”.
   */
  const resetTransientInputState = () => {
    keys.clear();
    bodyYaw += headLookYaw;
    headLookYaw = 0;
  };

  const onWindowBlur = () => {
    resetTransientInputState();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      resetTransientInputState();
    }
  };

  const onPointerLockChange = () => {
    if (document.pointerLockElement !== canvas) {
      resetTransientInputState();
    }
  };

  /** Replicated pose for rubber-banding (local display does not follow this each frame). */
  const serverPose = { x: 0, y: 1.35, z: 0 };
  let spawnSynced = false;
  /** Only snap on true teleports — tiny client/server drift must not yank the view. */
  const RUBBER_BAND_SNAP_M = 220;

  let meleeAttackSeq = 0;
  let lastMeleeMs = 0;

  const ingestPose = (row: PlayerPose) => {
    const id = row.identity.toHexString();
    const self = conn.identity?.isEqual(row.identity) ?? false;
    if (self) {
      serverPose.x = row.x;
      serverPose.y = row.y;
      serverPose.z = row.z;
      if (!spawnSynced) {
        pos.set(row.x, row.y, row.z);
        bodyYaw = row.yaw;
        spawnSynced = true;
      }
      const serverSeq = poseSeqAsBigint(row.seq);
      if (serverSeq > intentSeq) intentSeq = serverSeq;
      return;
    }
    feedRemote(interp, id, row, lastRemote);
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

  let poseAoiSub: SubscriptionHandle | null = null;
  let poseAoiAnchorX = pos.x;
  let poseAoiAnchorZ = pos.z;

  const subscribePoseAoi = (cx: number, cz: number) => {
    const selfId = conn.identity;
    if (!selfId) return;
    if (poseAoiSub?.isActive()) {
      poseAoiSub.unsubscribe();
    }
    const x0 = cx - POSE_AOI_HALF;
    const x1 = cx + POSE_AOI_HALF;
    const z0 = cz - POSE_AOI_HALF;
    const z1 = cz + POSE_AOI_HALF;
    const query = tables.player_pose.where((r) =>
      or(
        r.identity.eq(selfId),
        and(r.x.gte(x0), r.x.lte(x1), r.z.gte(z0), r.z.lte(z1)),
      ),
    );
    poseAoiSub = conn
      .subscriptionBuilder()
      .onApplied(() => {
        syncAllPoses();
      })
      .subscribe(query);
    poseAoiAnchorX = cx;
    poseAoiAnchorZ = cz;
  };

  subscribePoseAoi(poseAoiAnchorX, poseAoiAnchorZ);

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
      aimYaw: bodyYaw,
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (e.code === "AltLeft" || e.code === "AltRight") {
      e.preventDefault();
    }
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
    if (e.code === "AltLeft" || e.code === "AltRight") {
      bodyYaw += headLookYaw;
      headLookYaw = 0;
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    const freeLook = keys.has("AltLeft") || keys.has("AltRight");
    if (freeLook) {
      headLookYaw -= e.movementX * MOUSE_SENS;
      headLookYaw = Math.max(
        -FREE_LOOK_YAW_MAX,
        Math.min(FREE_LOOK_YAW_MAX, headLookYaw),
      );
    } else {
      bodyYaw -= e.movementX * MOUSE_SENS;
    }
    pitch -= e.movementY * MOUSE_SENS;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  };

  const onClick = () => {
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  };

  /** Latched here, consumed once per sim tick — collapses duplicate `pointerdown` bursts. */
  let meleePressPending = false;

  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    if (document.pointerLockElement !== canvas) return;
    meleePressPending = true;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("pointerdown", onPointerDown);

  let raf = 0;
  let lastFrameMs = performance.now();

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const nowMs = performance.now();
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.05);
    lastFrameMs = nowMs;

    if (meleePressPending) {
      meleePressPending = false;
      const tMelee = performance.now();
      if (tMelee - lastMeleeMs >= MELEE_COOLDOWN_MS) {
        lastMeleeMs = tMelee;
        meleeAttackSeq += 1;
      }
    }

    const input: FpLocomotionInput = {
      forward: keys.has("KeyW"),
      backward: keys.has("KeyS"),
      left: keys.has("KeyA"),
      right: keys.has("KeyD"),
      sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
      crouch: crouchToggle,
    };
    const jumpQueuedBeforeStep = loco.jumpQueued;
    const headY = stepFpLocomotion(loco, pos, bodyYaw, input, dt, {
      sampleWalkGroundTopY: sampleWalkTop,
      probeDy: fpLocomotionConstants.walkProbeDy,
      maxSupportDropM: fpLocomotionConstants.walkMaxSupportDropM,
    });

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
    playerRig.rotation.y = bodyYaw;
    headPivot.position.y = headY;
    headPivot.rotation.set(0, 0, 0);
    headPitch.rotation.x = pitch;
    headCameraPitch.rotation.x = pitch;
    headFreeLook.rotation.y = headLookYaw;

    const freeLook = keys.has("AltLeft") || keys.has("AltRight");
    const hs = Math.hypot(loco.velocity.x, loco.velocity.z);
    const walkStrength = THREE.MathUtils.clamp(
      hs / fpLocomotionConstants.sprintSpeedMps,
      0,
      1,
    );
    if (loco.grounded && !crouchToggle && !freeLook && hs > 0.12) {
      const roll = Math.sin(loco.headBobPhase * 2) * CAM_BOB_ROLL * walkStrength;
      const sway = Math.cos(loco.headBobPhase) * CAM_BOB_SWAY_X * walkStrength;
      const dip = Math.sin(loco.headBobPhase * 2) * CAM_BOB_DIP_Y * walkStrength;
      camera.rotation.z = roll;
      camera.position.x = sway;
      camera.position.y = dip;
    } else {
      camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, 0, 10, dt);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, 0, 10, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 0, 10, dt);
    }

    const now = performance.now();
    if (now - lastNet >= NET_INTERVAL_MS && conn.identity) {
      lastNet = now;
      sendMoveIntent(input, jumpQueuedBeforeStep);
    }

    if (conn.identity) {
      const drift = Math.hypot(pos.x - poseAoiAnchorX, pos.z - poseAoiAnchorZ);
      if (drift > POSE_AOI_RECENTER) {
        subscribePoseAoi(pos.x, pos.z);
      }
    }

    const remoteSnapshots = new Map(buildMockRemoteSnapshots(nowMs));
    if (conn.identity) {
      for (const row of conn.db.player_pose) {
        const id = row.identity.toHexString();
        if (conn.identity.isEqual(row.identity)) continue;
        const p = interp.getInterpolated(id, nowMs);
        const snap = replicatedPlayerSnapshotFromPlainPose(
          {
            playerIdHex: id,
            x: row.x,
            y: row.y,
            z: row.z,
            yawRad: row.yaw,
            velX: row.velX,
            velY: row.velY,
            velZ: row.velZ,
            grounded: row.grounded !== 0,
          },
          {
            observedTimeMs: nowMs,
            worldPositionOverride: p ?? undefined,
            equippedPrimary: "crowbar",
          },
        );
        remoteSnapshots.set(id, snap);
      }
    }

    const localId = conn.identity?.toHexString() ?? "local-unknown";
    const localState = buildLocalPlayerGameplayState({
      playerIdHex: localId,
      pos,
      yawRad: bodyYaw + headLookYaw,
      pitchRad: pitch,
      freeLookActive: freeLook,
      stridePhaseRad: loco.headBobPhase,
      vel: loco.velocity,
      grounded: loco.grounded,
      crouch: crouchToggle,
      meleeAttackSeq,
    });
    presentation.update(dt, localState, remoteSnapshots, nowMs);

    renderer.render(scene, camera);
  };
  tick();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("pointerdown", onPointerDown);
    if (poseAoiSub?.isActive()) {
      poseAoiSub.unsubscribe();
    }
    poseAoiSub = null;
    conn.db.player_pose.removeOnInsert(onPoseInsert);
    conn.db.player_pose.removeOnUpdate(onPoseUpdate);
    disposeFpEnvironment();
    presentation.dispose();
    renderer.dispose();
    scene.clear();
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
  };
}

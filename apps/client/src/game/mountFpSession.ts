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
import { parseFloorDoc } from "@the-mammoth/world";
import { createFpSessionStaticWorld } from "./fpSessionWorldMount";
import { feedRemotePoseSample, type FpRemotePoseLastXZ } from "./fpSessionRemotePoseFeed";
import { floorPayloadByDocId } from "./fpSessionContentLoad";
import { encodeMoveIntentBits } from "./moveIntentCodec";
import { PoseInterpBuffer } from "./poseInterpBuffer";
import { replicatedPlayerSnapshotFromPlainPose } from "@the-mammoth/net";
import { buildLocalPlayerGameplayState } from "./localPlayerGameplay";
import { effectiveDevGameplayEquippedPrimary } from "./devGameplayWeaponOverride";
import {
  HOTBAR_DIGIT_DEBOUNCE_MS,
  HOTBAR_SLOT_COUNT,
  hotbarSlotHasInstantConsume,
} from "./fpHotbarActivate";
import {
  getFpHotbarSelectedSlot,
  setFpHotbarSelectedSlot,
  subscribeFpHotbarSelection,
} from "./fpHotbarSelection";
import { resolveHeldItemFromHotbar } from "./fpHotbarResolve";
import { attachFpSessionEnvironment } from "./fpSessionEnvironment";
import {
  onFpSessionPostRenderFrame,
  resetFpSessionFpsDisplay,
} from "./fpSessionFpsDisplay";
import { createFpSessionPerfDebugPostRenderHook } from "./fpSessionPerfDebug";
import { mountFpElevatorWorld } from "./fpElevatorWorld.js";
import { mountFpViewmodelAuthoringDevOnly } from "./fpViewmodelAuthoringOverlay.js";
import { mountWeaponPresentationDevHotReload } from "./weaponPresentationDevHotReload.js";
import { buildMockRemoteSnapshots } from "./mockRemoteSnapshots";
import { getMammothItemDef } from "../inventory/mammothItemCatalog";
import { LocalGameAudio } from "./localGameAudio";
import {
  primeHotbarConsumeAudio,
  registerHotbarConsumeLocalPlayback,
  registerHotbarConsumePrimeAudio,
  unregisterHotbarConsumeLocalAudio,
} from "./hotbarConsumeLocalAudio";
import { runFpHotbarInstantConsume } from "./fpHotbarConsume";
import {
  findNearestDroppedPickup,
  MAMMOTH_PICKUP_RADIUS_M,
  mountDroppedItemsWorld,
} from "./droppedItemWorldRuntime";
import { setFpPickupPrompt } from "./fpPickupPrompt";
import { WorldProximityAudio } from "./worldProximityAudio";
import { poseSeqAsBigint } from "./fpSessionPoseSeq";

/**
 * Intent publish cadence — keep near `apps/server/src/movement.rs` physics schedule
 * (`TimeDuration::from_micros(50_000)` ≈ 20 Hz) so prediction and authority stay aligned.
 */
const NET_INTERVAL_MS = 50;

/** Horizontal half-extent (m) of the replicated `player_pose` box (XZ). */
const POSE_AOI_HALF = 42;
/** Slightly wider than pose AOI so swing/foot events at the edge are still subscribed. */
const WORLD_SOUND_AOI_HALF = POSE_AOI_HALF + 8;
/** Recentre AOI when predicted position moves this far from the last subscription anchor (m). */
const POSE_AOI_RECENTER = 14;
const MOUSE_SENS = 0.0022;
/** ~88° — enough to scan hoistway tops without going full flip. */
const PITCH_LIMIT = 1.53;
/** Alt free-look: head yaw relative to body (radians, clamped per side; ~±135°, not full 180°). */
const FREE_LOOK_YAW_MAX = 2.35;
/** Extra camera bob on top of eye-height bob from `stepFpLocomotion` (meters, local space). */
const CAM_BOB_DIP_Y = 0.004;

const MELEE_COOLDOWN_MS = 480;

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
export async function mountFpSession(
  canvas: HTMLCanvasElement,
  conn: DbConnection,
): Promise<() => void> {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  resetFpSessionFpsDisplay();
  const logFpPerf = createFpSessionPerfDebugPostRenderHook(renderer);
  const disposeFpEnvironment = attachFpSessionEnvironment(scene, renderer);

  const { rig: playerRig, headPivot, headPitch, headCameraPitch, headFreeLook, camera } =
    createFPRig(fpLocomotionConstants.eyeStand);
  scene.add(playerRig);

  const { building, buildingRoot, cellRoot, sampleWalkTopBase } = createFpSessionStaticWorld();
  scene.add(buildingRoot);

  const fpElevators = mountFpElevatorWorld({
    conn,
    buildingRoot,
    building,
    getFloorDoc: (id) => parseFloorDoc(floorPayloadByDocId(id)),
  });

  scene.add(cellRoot);

  const initialHeld = conn.identity
    ? effectiveDevGameplayEquippedPrimary(
        resolveHeldItemFromHotbar(conn, conn.identity, getFpHotbarSelectedSlot()),
      )
    : ("unarmed" as const);

  const presentation = await PlayerPresentationManager.create({
    scene,
    fpViewModelParent: headPitch,
    initialEquippedPrimary: initialHeld,
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

  const fpAuthoringActiveRef = { active: false };
  const disposeFpAuthoring = mountFpViewmodelAuthoringDevOnly({
    scene,
    camera,
    canvas,
    presentation,
    activeRef: fpAuthoringActiveRef,
  });

  const disposeWeaponPresentationHotReload = mountWeaponPresentationDevHotReload(presentation);

  /** Must match `apps/server/src/loadout.rs` `ACTIVE_HOTBAR_SLOT_CLEARED`. */
  const ACTIVE_HOTBAR_SLOT_CLEARED = 255;
  let lastSentHotbarRail: number | null | undefined = undefined;
  const syncActiveHotbarSlotToServer = () => {
    if (!conn.identity) return;
    const slot = getFpHotbarSelectedSlot();
    if (slot === lastSentHotbarRail) return;
    lastSentHotbarRail = slot;
    const slotIndex = slot === null ? ACTIVE_HOTBAR_SLOT_CLEARED : slot;
    try {
      void conn.reducers.setActiveHotbarSlot({ slotIndex });
    } catch (err) {
      console.warn("[mountFpSession] setActiveHotbarSlot failed", err);
    }
  };
  const unsubHotbarRail = subscribeFpHotbarSelection(syncActiveHotbarSlotToServer);

  const interp = new PoseInterpBuffer();
  const lastRemote = new Map<string, FpRemotePoseLastXZ>();

  /** Lobby hub (ground floor): near elevators + stairs at z=0 (`floor_mamutica_ground`). */
  const pos = new THREE.Vector3(0, 1.35, 0);
  const _floorVisCamWorld = new THREE.Vector3();

  const syncBuildingFloorPlateVisibility = () => {
    camera.getWorldPosition(_floorVisCamWorld);
    const band = fpElevators.getFloorVisibilityBand(
      pos.x,
      pos.y,
      pos.z,
      performance.now(),
      _floorVisCamWorld.y,
    );
    for (const ch of buildingRoot.children) {
      if (ch.userData.mammothAlwaysVisible === true) {
        ch.visible = true;
        continue;
      }
      const li = ch.userData.mammothPlateLevelIndex;
      if (typeof li === "number") {
        ch.visible = li >= band.lo && li <= band.hi;
      }
    }
  };
  /** Feet / capsule yaw — sent as `aimYaw` to the server and used for locomotion. */
  let bodyYaw = 0;
  /** Mouse look pitch (head pivot X). */
  let pitch = 0;
  /** Alt free-look yaw on `headFreeLook` only (radians); cleared on Alt release (body yaw unchanged). */
  let headLookYaw = 0;
  /** Monotonic intent id; server rejects non-increasing `intent_seq`. */
  let intentSeq = 0n;
  let lastNet = 0;

  const keys = new Set<string>();
  let crouchToggle = false;
  const loco = createFpLocomotionState();

  /**
   * While rising from a real jump, skip elevator cab walk merge — otherwise `mergeWalkTop` keeps the
   * cab as the highest support and locomotion snaps feet back to the floor every substep.
   * Must stay **well above** upward velocity from a rising cab (~3 m/s) or merge drops for whole frames.
   */
  const ELEVATOR_WALK_MERGE_SKIP_VY = 2.0;
  const sampleWalkTop = (
    worldX: number,
    worldZ: number,
    probeTopY: number,
    evalWallClockMs?: number,
  ) => {
    const base = sampleWalkTopBase(worldX, worldZ, probeTopY);
    if (loco.velocity.y > ELEVATOR_WALK_MERGE_SKIP_VY) {
      return base;
    }
    return fpElevators.mergeWalkTop(
      worldX,
      worldZ,
      probeTopY,
      fpLocomotionConstants.walkFootRadiusXZ,
      fpLocomotionConstants.walkStepUpMargin,
      base,
      evalWallClockMs,
    );
  };

  /** Footsteps: Web Audio, up to six `public/audio/ui/footstep*.wav`; see `localGameAudio.ts`. */
  const localAudio = new LocalGameAudio();
  registerHotbarConsumePrimeAudio(() => localAudio.unlock());
  registerHotbarConsumeLocalPlayback((profile) => localAudio.playHotbarConsumeLocal(profile));
  const worldAudio = new WorldProximityAudio(conn, () => camera);
  let worldAudioReady = false;

  const refreshWorldSoundSubscription = () => {
    if (!worldAudioReady) return;
    worldAudio.subscribeAoi(poseAoiAnchorX, poseAoiAnchorZ, WORLD_SOUND_AOI_HALF);
  };

  /**
   * Browsers often skip `keyup` when the tab/window loses focus — keys (including Alt) stay in
   * `keys`, so free-look stays latched and mouse X only drives `headLookYaw` until Alt “releases”.
   *
   * Before clearing keys, **bake** `headLookYaw` into `bodyYaw` so the horizontal view direction
   * (body + free-look) does not jump when we drop Alt from `keys` or zero out free-look. Intentional
   * Alt key-up still clears head offset without merging — see `onKeyUp`.
   */
  const commitFreeLookIntoBodyYaw = () => {
    if (headLookYaw !== 0) {
      bodyYaw += headLookYaw;
      headLookYaw = 0;
      bodyYaw = Math.atan2(Math.sin(bodyYaw), Math.cos(bodyYaw));
    }
  };

  /** Window hidden / defocused: browsers may omit `keyup` — drop all latched keys. */
  const resetTransientInputState = () => {
    commitFreeLookIntoBodyYaw();
    keys.clear();
  };

  const onWindowBlur = () => {
    resetTransientInputState();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      resetTransientInputState();
    }
  };

  /**
   * Pointer lock ends while the document can still be focused (Tab inventory, Esc, etc.).
   * Do **not** clear `keys` here — that would cancel held WASD until keys are pressed again.
   * Still fold Alt free-look into body yaw so view direction stays consistent when mouse stops.
   */
  const onPointerLockChange = () => {
    if (document.pointerLockElement !== canvas) {
      commitFreeLookIntoBodyYaw();
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
    feedRemotePoseSample(interp, id, row, lastRemote);
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

  const droppedWorld = mountDroppedItemsWorld(scene, conn, POSE_AOI_HALF, {
    onPickupRemoved: async () => {
      await localAudio.unlock();
      localAudio.playItemPickLocal();
    },
  });

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
    refreshWorldSoundSubscription();
    droppedWorld.subscribeAoi(cx, cz);
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

  const mammothInventoryOpen = () =>
    document.querySelector('[data-mammoth-inventory="open"]') !== null;

  /** Same `DigitN` / slot within {@link HOTBAR_DIGIT_DEBOUNCE_MS} — ignored unless it would consume. */
  const digitKeyDebounce = { code: "", at: 0, slot: -1 };

  const onWheelHotbar = (e: WheelEvent) => {
    if (mammothInventoryOpen() || isTextInputFocused()) return;
    if (document.pointerLockElement !== canvas) return;
    if (e.deltaY === 0) return;
    const target = e.target;
    if (target instanceof Element && target.closest("[data-mammoth-no-hotbar-wheel='true']")) {
      return;
    }
    e.preventDefault();
    const prev = getFpHotbarSelectedSlot();
    const cur = prev === null ? 0 : prev;
    const next =
      e.deltaY < 0
        ? (cur - 1 + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT
        : (cur + 1) % HOTBAR_SLOT_COUNT;
    setFpHotbarSelectedSlot(next);
  };

  const isTextInputFocused = () => {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (e.code === "AltLeft" || e.code === "AltRight") {
      e.preventDefault();
    }
    if (!isTextInputFocused() && !mammothInventoryOpen()) {
      let n = -1;
      if (e.code.startsWith("Digit")) {
        n = Number.parseInt(e.code.slice(5), 10);
      } else if (e.code.startsWith("Numpad") && e.code.length === 7) {
        n = Number.parseInt(e.code.slice(6), 10);
      }
      if (n >= 1 && n <= HOTBAR_SLOT_COUNT) {
        e.preventDefault();
        if (e.repeat) return;
        const newSlot = n - 1;
        const keyCode = e.code;
        const now = performance.now();
        if (!conn.identity) {
          setFpHotbarSelectedSlot(newSlot);
          digitKeyDebounce.code = keyCode;
          digitKeyDebounce.at = now;
          digitKeyDebounce.slot = newSlot;
          return;
        }
        const prevSel = getFpHotbarSelectedSlot();
        const willConsume =
          prevSel === newSlot && hotbarSlotHasInstantConsume(conn, conn.identity, newSlot);

        if (!willConsume) {
          if (
            digitKeyDebounce.code === keyCode &&
            digitKeyDebounce.slot === newSlot &&
            now - digitKeyDebounce.at < HOTBAR_DIGIT_DEBOUNCE_MS
          ) {
            return;
          }
        }

        digitKeyDebounce.code = keyCode;
        digitKeyDebounce.at = now;
        digitKeyDebounce.slot = newSlot;

        if (willConsume) {
          void runFpHotbarInstantConsume(
            conn,
            conn.identity,
            newSlot,
            primeHotbarConsumeAudio,
            "mountFpSession",
          );
          return;
        }
        setFpHotbarSelectedSlot(newSlot);
      }
    }
    if (e.code === "Escape") void document.exitPointerLock();
    if (
      e.code === "KeyE" &&
      !e.repeat &&
      !mammothInventoryOpen() &&
      !isTextInputFocused()
    ) {
      e.preventDefault();
      if (fpElevators.consumeInteractKey(pos)) return;
      if (fpElevators.shouldSuppressEpickup(pos)) return;
      droppedWorld.tryPickupNearest(pos.x, pos.y, pos.z);
    }
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
      headLookYaw = 0;
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (fpAuthoringActiveRef.active) return;
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
    void (async () => {
      await localAudio.unlock();
      const actx = localAudio.getAudioContext();
      if (actx) {
        await worldAudio.attachSharedContext(actx, localAudio.getFootstepBuffers());
        worldAudioReady = true;
        refreshWorldSoundSubscription();
      }
    })();
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  };

  /** HUD layers use `pointer-events: none` in gaps; suppress the browser menu on the world view. */
  const onCanvasContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  /** Latched here, consumed once per sim tick — collapses duplicate `pointerdown` bursts. */
  let meleePressPending = false;

  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    const nowMs = performance.now();
    if (fpElevators.tryRaycastFloorPick(camera, pos, nowMs)) return;
    meleePressPending = true;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("wheel", onWheelHotbar, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", onCanvasContextMenu);

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
        localAudio.playMeleeWeaponSwingLocal();
        if (conn.identity) void conn.reducers.submitMeleeSwing({});
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
    const frameNowMs = performance.now();
    fpElevators.syncCabEvalClock(frameNowMs);

    const probeTopForElev = pos.y + fpLocomotionConstants.walkProbeDy;
    const baseForElev = sampleWalkTopBase(pos.x, pos.z, probeTopForElev);
    const elevatorJumpVy =
      !loco.grounded ||
      loco.velocity.y > ELEVATOR_WALK_MERGE_SKIP_VY
        ? 0
        : fpElevators.getElevatorKinematicSupportVyMps({
            worldX: pos.x,
            worldZ: pos.z,
            probeTopY: probeTopForElev,
            footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
            stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
            baseTop: baseForElev,
            evalWallClockMs: frameNowMs,
          });

    const headY = stepFpLocomotion(loco, pos, bodyYaw, input, dt, {
      sampleWalkGroundTopY: sampleWalkTop,
      probeDy: fpLocomotionConstants.walkProbeDy,
      maxSupportDropM: fpLocomotionConstants.walkMaxSupportDropM,
      jumpKinematicPlatformVyMps: elevatorJumpVy,
      integrationEvalEndWallClockMs: frameNowMs,
    });

    fpElevators.snapLocalRiderFeetToAuthoritativeCabIfNeeded(
      pos,
      loco,
      frameNowMs,
      jumpQueuedBeforeStep,
    );
    fpElevators.clampLocalRiderXZToAuthoritativeCabIfNeeded(pos, loco, frameNowMs);

    fpElevators.tick(dt, frameNowMs, pos);

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
    const freeLook = keys.has("AltLeft") || keys.has("AltRight");
    // Alt: yaw + pitch on the camera chain only — weapon stays body-level on pitch (neck look).
    headPitch.rotation.x = freeLook ? 0 : pitch;
    headCameraPitch.rotation.x = pitch;
    headFreeLook.rotation.y = headLookYaw;
    const hs = Math.hypot(loco.velocity.x, loco.velocity.z);
    if (worldAudioReady) {
      worldAudio.syncListener();
    }

    localAudio.update(dt, {
      horizontalSpeed: hs,
      stridePhaseRad: loco.headBobPhase,
      grounded: loco.grounded,
      crouch: crouchToggle,
      sprint: input.sprint,
      freeLook,
    });
    const walkStrength = THREE.MathUtils.clamp(
      hs / fpLocomotionConstants.sprintSpeedMps,
      0,
      1,
    );
    if (loco.grounded && !crouchToggle && !freeLook && hs > 0.12) {
      // Stride-locked vertical bob only (roll / lateral sway read as side-to-side rocking).
      const dip = Math.sin(loco.headBobPhase * 2) * CAM_BOB_DIP_Y * walkStrength;
      camera.rotation.z = 0;
      camera.position.x = 0;
      camera.position.y = dip;
    } else {
      camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, 0, 10, dt);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, 0, 10, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 0, 10, dt);
    }

    syncActiveHotbarSlotToServer();

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
            equippedPrimary: "unarmed",
          },
        );
        remoteSnapshots.set(id, snap);
      }
    }

    const localId = conn.identity?.toHexString() ?? "local-unknown";
    const hotbarHeld = conn.identity
      ? resolveHeldItemFromHotbar(conn, conn.identity, getFpHotbarSelectedSlot())
      : ("unarmed" as const);

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
      equippedPrimaryFromHotbar: hotbarHeld,
    });
    presentation.update(dt, localState, remoteSnapshots, nowMs);

    if (conn.identity) {
      const hit = findNearestDroppedPickup(
        conn,
        pos.x,
        pos.y,
        pos.z,
        MAMMOTH_PICKUP_RADIUS_M,
      );
      if (hit) {
        const def = getMammothItemDef(hit.defId);
        setFpPickupPrompt({
          droppedItemIdStr: hit.droppedItemId.toString(),
          displayName: def?.displayName ?? hit.defId,
        });
      } else {
        setFpPickupPrompt(null);
      }
    } else {
      setFpPickupPrompt(null);
    }

    syncBuildingFloorPlateVisibility();
    renderer.render(scene, camera);
    onFpSessionPostRenderFrame(performance.now());
    logFpPerf();
  };
  tick();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("wheel", onWheelHotbar);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("contextmenu", onCanvasContextMenu);
    if (poseAoiSub?.isActive()) {
      poseAoiSub.unsubscribe();
    }
    poseAoiSub = null;
    setFpPickupPrompt(null);
    fpElevators.dispose();
    droppedWorld.dispose();
    conn.db.player_pose.removeOnInsert(onPoseInsert);
    conn.db.player_pose.removeOnUpdate(onPoseUpdate);
    disposeFpEnvironment();
    disposeFpAuthoring();
    disposeWeaponPresentationHotReload();
    unsubHotbarRail();
    worldAudio.dispose();
    worldAudioReady = false;
    unregisterHotbarConsumeLocalAudio();
    localAudio.dispose();
    presentation.dispose();
    renderer.dispose();
    scene.clear();
    resetFpSessionFpsDisplay();
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
  };
}

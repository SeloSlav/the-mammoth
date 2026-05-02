import * as THREE from "three";
import type { BuildingDoc } from "@the-mammoth/schemas";
import type { CollisionAabb } from "@the-mammoth/world";
import type { PlayerPose } from "../../module_bindings/types";
import type { MountFpApartmentDoorsResult } from "../fpApartment/fpApartmentDoors.js";
import type { MountFpElevatorWorldResult } from "../fpElevator/fpElevatorWorldTypes.js";
import {
  FP_PLAYER_COLLISION_HEIGHT_CROUCH_M,
  FP_PLAYER_COLLISION_HEIGHT_STAND_M,
  FP_PLAYER_COLLISION_RADIUS_M,
} from "../fpPhysics/fpPlayerCollision.js";
import { poseSeqAsBigint } from "./fpSessionPoseSeq.js";
import type { FpSessionStaticWorld } from "./fpSessionWorldMount.js";

export type FpSessionDoorDebugState = {
  enabled: boolean;
  radiusM: number;
  minLogIntervalMs: number;
  lastLogMs: number;
  reconcileMinLogIntervalMs: number;
  lastReconcileLogMs: number;
};

export type FpSessionWallProbeState = {
  enabled: boolean;
  maxDistanceM: number;
};

export type FpSessionElevDebugTickCtx = {
  nowMs: number;
  dt: number;
  totalFrameMs: number;
  physicsMs: number;
  elevatorMs: number;
  presentMs: number;
  renderMs: number;
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  fpElevators: Pick<MountFpElevatorWorldResult, "sampleRideDebug">;
  displayOffset: THREE.Vector3;
  playerRig: THREE.Object3D;
  lastTickElevSupportVyMps: number;
  lastTickHudCabVyMps: number;
  lastTickElevVyBlendAbs: number;
  floorVisCamWorld: THREE.Vector3;
  floorVisCamDir: THREE.Vector3;
};

export type InstallFpSessionDevDebugApisOpts = {
  playerPos: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  buildingRoot: THREE.Object3D;
  building: BuildingDoc;
  staticCollisionIndex: FpSessionStaticWorld["staticCollisionIndex"];
  fpApartmentDoors: Pick<
    MountFpApartmentDoorsResult,
    "debugSnapshot" | "visitCollisionAabbsInXZ"
  >;
  fpElevators: Pick<
    MountFpElevatorWorldResult,
    "visitCollisionAabbsInXZ" | "sampleRideDebug"
  >;
};

type DoorDebugFrame = {
  prev: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  resolved: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  crouch: boolean;
};

const MM_DOOR_DEBUG_AUTOSTART_STORAGE_KEY = "mmDoorDebugAutostart";
const MM_ELEV_DEBUG_AUTOSTART_STORAGE_KEY = "mmElevDebugAutostart";
const MM_WALL_PROBE_AUTOSTART_STORAGE_KEY = "mmWallProbeAutostart";

/** Require this many consecutive frames outside HUD cab before `[exit]` (kills one-frame flicker at door seams). */
const ELEV_DEBUG_EXIT_DEBOUNCE_FRAMES = 5;

/**
 * Browser devtools: door collision, elevator hitch, crosshair wall probe.
 * Lives in a module so `mountFpSession` stays readable; behavior matches the previous inline block.
 */
export function installFpSessionDevDebugApis(
  deps: InstallFpSessionDevDebugApisOpts,
): {
  doorDebugState: FpSessionDoorDebugState;
  wallProbeState: FpSessionWallProbeState;
  logDoorDebugFrame: (f: DoorDebugFrame) => void;
  logDoorDebugReconcile: (
    serverRow: PlayerPose,
    predictedBefore: { x: number; y: number; z: number },
    replayed: { x: number; y: number; z: number },
    crouch: boolean,
    pendingIntentCount: number,
  ) => void;
  probeWallHit: (maxDistanceM?: number) => unknown;
  tickElevDebug: (ctx: FpSessionElevDebugTickCtx) => void;
  dispose: () => void;
} {
  const { playerPos: pos, camera, buildingRoot, building, staticCollisionIndex } = deps;
  const { fpApartmentDoors, fpElevators } = deps;

  const doorDebugState: FpSessionDoorDebugState = {
    enabled: false,
    radiusM: 2.5,
    minLogIntervalMs: 200,
    lastLogMs: 0,
    reconcileMinLogIntervalMs: 120,
    lastReconcileLogMs: 0,
  };

  const __mmElevDebugState = {
    enabled: false,
    intervalMs: 300,
    hitchMs: 22,
    logSlowFramesAlways: false,
    lastPeriodicLogMs: 0,
    seenRideHud: false,
    hudMissStreak: 0,
  };

  const wallProbeState: FpSessionWallProbeState = {
    enabled: false,
    maxDistanceM: 20,
  };

  const _wallProbeCamWorld = new THREE.Vector3();
  const _wallProbeCamDir = new THREE.Vector3();
  const _wallProbeHitNormal = new THREE.Vector3();
  const _wallProbeRaycaster = new THREE.Raycaster();

  const floorLabelByLevel = new Map(
    building.floorRefs.map((ref) => [ref.levelIndex, ref.shortLabel || String(ref.levelIndex)]),
  );

  const classifyOverlapSides = (
    aabb: { min: [number, number, number]; max: [number, number, number] },
    body: { cx: number; cz: number; yMin: number; yMax: number; radius: number },
  ): string[] => {
    const sides: string[] = [];
    if (aabb.min[0] <= body.cx - body.radius + 1e-4) sides.push("-x");
    if (aabb.max[0] >= body.cx + body.radius - 1e-4) sides.push("+x");
    if (aabb.min[2] <= body.cz - body.radius + 1e-4) sides.push("-z");
    if (aabb.max[2] >= body.cz + body.radius - 1e-4) sides.push("+z");
    if (aabb.min[1] <= body.yMin + 1e-4) sides.push("-y");
    if (aabb.max[1] >= body.yMax - 1e-4) sides.push("+y");
    return sides;
  };

  const printDoorDebugJson = (label: string, payload: unknown): void => {
    console.log(`[mmDoorDebug:${label}] ${JSON.stringify(payload, null, 2)}`);
  };

  const readDoorDebugAutostart = (): boolean => {
    try {
      return globalThis.localStorage?.getItem(MM_DOOR_DEBUG_AUTOSTART_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  };

  const writeDoorDebugAutostart = (enabled: boolean): void => {
    try {
      if (enabled) globalThis.localStorage?.setItem(MM_DOOR_DEBUG_AUTOSTART_STORAGE_KEY, "1");
      else globalThis.localStorage?.removeItem(MM_DOOR_DEBUG_AUTOSTART_STORAGE_KEY);
    } catch {
      /* ignore storage failures */
    }
  };

  const roundV = (v: { x: number; y: number; z: number }) => ({
    x: +v.x.toFixed(3),
    y: +v.y.toFixed(3),
    z: +v.z.toFixed(3),
  });

  const roundAabb = (a: CollisionAabb | null) =>
    a
      ? {
          min: [+a.min[0].toFixed(3), +a.min[1].toFixed(3), +a.min[2].toFixed(3)],
          max: [+a.max[0].toFixed(3), +a.max[1].toFixed(3), +a.max[2].toFixed(3)],
        }
      : null;

  const snapshotDoorDebugAt = (x: number, z: number, radiusM: number) =>
    fpApartmentDoors.debugSnapshot(x, z, radiusM).map((d) => ({
      rowKey: d.rowKey,
      level: d.level,
      face: d.face,
      hingeX: +d.hingeX.toFixed(3),
      hingeZ: +d.hingeZ.toFixed(3),
      feetY: +d.feetY.toFixed(3),
      panelW: +d.panelWidthM.toFixed(3),
      panelH: +d.panelHeightM.toFixed(3),
      desired: d.desiredOpen,
      visualOpen01: +d.visualOpen01.toFixed(3),
      replicatedOpen01: +d.replicatedOpen01.toFixed(3),
      open01Skew: +Math.abs(d.visualOpen01 - d.replicatedOpen01).toFixed(3),
      regime: d.regime,
      serverRegime: d.serverRegime,
      aabb: roundAabb(d.emittedAabb),
      distance: +d.distanceMeters.toFixed(3),
    }));

  const snapshotDoorDebug = (radiusM: number) => snapshotDoorDebugAt(pos.x, pos.z, radiusM);

  const snapshotStaticAabbs = (
    radiusM: number,
  ): { min: [number, number, number]; max: [number, number, number] }[] => {
    const out: { min: [number, number, number]; max: [number, number, number] }[] = [];
    staticCollisionIndex.visitAabbsInXZ(
      pos.x - radiusM,
      pos.x + radiusM,
      pos.z - radiusM,
      pos.z + radiusM,
      (a) => {
        out.push({
          min: [+a.min[0].toFixed(3), +a.min[1].toFixed(3), +a.min[2].toFixed(3)],
          max: [+a.max[0].toFixed(3), +a.max[1].toFixed(3), +a.max[2].toFixed(3)],
        });
      },
    );
    return out;
  };

  const snapshotStaticBodyOverlaps = (
    center: { x: number; y: number; z: number },
    crouch: boolean,
    inflateM = 0.01,
  ) => {
    const radius = FP_PLAYER_COLLISION_RADIUS_M;
    const bodyH = crouch ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M : FP_PLAYER_COLLISION_HEIGHT_STAND_M;
    const yMin = center.y;
    const yMax = center.y + bodyH;
    const xMin = center.x - radius - inflateM;
    const xMax = center.x + radius + inflateM;
    const zMin = center.z - radius - inflateM;
    const zMax = center.z + radius + inflateM;
    const out: {
      min: [number, number, number];
      max: [number, number, number];
      overlapSides: string[];
      distanceMeters: number;
    }[] = [];
    staticCollisionIndex.visitAabbsInXZ(xMin, xMax, zMin, zMax, (a) => {
      if (a.max[1] < yMin - inflateM || a.min[1] > yMax + inflateM) return;
      if (a.max[0] < xMin || a.min[0] > xMax) return;
      if (a.max[2] < zMin || a.min[2] > zMax) return;
      const clampedX = Math.max(a.min[0], Math.min(center.x, a.max[0]));
      const clampedZ = Math.max(a.min[2], Math.min(center.z, a.max[2]));
      const dx = clampedX - center.x;
      const dz = clampedZ - center.z;
      const distance = Math.hypot(dx, dz);
      const rounded = {
        min: [+a.min[0].toFixed(3), +a.min[1].toFixed(3), +a.min[2].toFixed(3)] as [number, number, number],
        max: [+a.max[0].toFixed(3), +a.max[1].toFixed(3), +a.max[2].toFixed(3)] as [number, number, number],
      };
      out.push({
        ...rounded,
        overlapSides: classifyOverlapSides(rounded, {
          cx: center.x,
          cz: center.z,
          yMin,
          yMax,
          radius,
        }),
        distanceMeters: +distance.toFixed(4),
      });
    });
    out.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return out;
  };

  const snapshotDynamicBodyOverlaps = (
    center: { x: number; y: number; z: number },
    crouch: boolean,
    inflateM = 0.01,
  ) => {
    const radius = FP_PLAYER_COLLISION_RADIUS_M;
    const bodyH = crouch ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M : FP_PLAYER_COLLISION_HEIGHT_STAND_M;
    const yMin = center.y;
    const yMax = center.y + bodyH;
    const xMin = center.x - radius - inflateM;
    const xMax = center.x + radius + inflateM;
    const zMin = center.z - radius - inflateM;
    const zMax = center.z + radius + inflateM;
    const out: {
      min: [number, number, number];
      max: [number, number, number];
      overlapSides: string[];
      distanceMeters: number;
    }[] = [];
    const visit = (a: CollisionAabb): void => {
      if (a.max[1] < yMin - inflateM || a.min[1] > yMax + inflateM) return;
      if (a.max[0] < xMin || a.min[0] > xMax) return;
      if (a.max[2] < zMin || a.min[2] > zMax) return;
      const clampedX = Math.max(a.min[0], Math.min(center.x, a.max[0]));
      const clampedZ = Math.max(a.min[2], Math.min(center.z, a.max[2]));
      const distance = Math.hypot(clampedX - center.x, clampedZ - center.z);
      const rounded = {
        min: [+a.min[0].toFixed(3), +a.min[1].toFixed(3), +a.min[2].toFixed(3)] as [number, number, number],
        max: [+a.max[0].toFixed(3), +a.max[1].toFixed(3), +a.max[2].toFixed(3)] as [number, number, number],
      };
      out.push({
        ...rounded,
        overlapSides: classifyOverlapSides(rounded, {
          cx: center.x,
          cz: center.z,
          yMin,
          yMax,
          radius,
        }),
        distanceMeters: +distance.toFixed(4),
      });
    };
    fpApartmentDoors.visitCollisionAabbsInXZ(xMin, xMax, zMin, zMax, visit, undefined);
    fpElevators.visitCollisionAabbsInXZ(xMin, xMax, zMin, zMax, visit, undefined);
    out.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return out;
  };

  const logDoorDebugFrame = (f: DoorDebugFrame): void => {
    const nowMs = performance.now();
    if (nowMs - doorDebugState.lastLogMs < doorDebugState.minLogIntervalMs) return;
    const dx = f.target.x - f.resolved.x;
    const dz = f.target.z - f.resolved.z;
    const clampedBy = Math.hypot(dx, dz);
    const clamped = clampedBy > 0.002;
    const moved = Math.hypot(f.resolved.x - f.prev.x, f.resolved.z - f.prev.z);
    const attempted = Math.hypot(f.target.x - f.prev.x, f.target.z - f.prev.z);
    if (!clamped && attempted < 0.005) return;
    doorDebugState.lastLogMs = nowMs;
    const nearbyDoors = fpApartmentDoors.debugSnapshot(
      f.resolved.x,
      f.resolved.z,
      doorDebugState.radiusM,
    );
    const resolveDirection = (): string | null => {
      if (clampedBy <= 1e-4) return null;
      const parts: string[] = [];
      if (Math.abs(dx) > 1e-4) parts.push(dx > 0 ? "-x (pushed west)" : "+x (pushed east)");
      if (Math.abs(dz) > 1e-4) parts.push(dz > 0 ? "-z (pushed north)" : "+z (pushed south)");
      return parts.join(", ");
    };
    const staticOverlaps = clamped ? snapshotStaticBodyOverlaps(f.resolved, f.crouch) : [];
    const dynamicOverlaps = clamped ? snapshotDynamicBodyOverlaps(f.resolved, f.crouch) : [];
    const payload = {
      clamped,
      clampedByMeters: +clampedBy.toFixed(4),
      clampDirection: resolveDirection(),
      attemptedMoveM: +attempted.toFixed(4),
      resolvedMoveM: +moved.toFixed(4),
      prev: roundV(f.prev),
      target: roundV(f.target),
      resolved: roundV(f.resolved),
      velocity: roundV(f.velocity),
      bodyRadiusM: FP_PLAYER_COLLISION_RADIUS_M,
      bodyHeightM: f.crouch ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M : FP_PLAYER_COLLISION_HEIGHT_STAND_M,
      nearbyDoors: nearbyDoors.map((d) => ({
        rowKey: d.rowKey,
        level: d.level,
        face: d.face,
        hingeX: +d.hingeX.toFixed(3),
        hingeZ: +d.hingeZ.toFixed(3),
        feetY: +d.feetY.toFixed(3),
        panelW: +d.panelWidthM.toFixed(3),
        panelH: +d.panelHeightM.toFixed(3),
        desired: d.desiredOpen,
        visualOpen01: +d.visualOpen01.toFixed(3),
        replicatedOpen01: +d.replicatedOpen01.toFixed(3),
        open01Skew: +Math.abs(d.visualOpen01 - d.replicatedOpen01).toFixed(3),
        regime: d.regime,
        serverRegime: d.serverRegime,
        aabb: roundAabb(d.emittedAabb),
        distance: +d.distanceMeters.toFixed(3),
      })),
      staticOverlaps,
      dynamicOverlaps,
    };
    printDoorDebugJson("frame", payload);
  };

  const logDoorDebugReconcile = (
    serverRow: PlayerPose,
    predictedBefore: { x: number; y: number; z: number },
    replayed: { x: number; y: number; z: number },
    crouch: boolean,
    pendingIntentCount: number,
  ): void => {
    if (!doorDebugState.enabled) return;
    const nowMs = performance.now();
    if (nowMs - doorDebugState.lastReconcileLogMs < doorDebugState.reconcileMinLogIntervalMs) {
      return;
    }
    const serverDelta = {
      x: serverRow.x - predictedBefore.x,
      y: serverRow.y - predictedBefore.y,
      z: serverRow.z - predictedBefore.z,
    };
    const replayDelta = {
      x: replayed.x - predictedBefore.x,
      y: replayed.y - predictedBefore.y,
      z: replayed.z - predictedBefore.z,
    };
    const serverDeltaM = Math.hypot(serverDelta.x, serverDelta.y, serverDelta.z);
    const replayDeltaM = Math.hypot(replayDelta.x, replayDelta.y, replayDelta.z);
    if (serverDeltaM < 0.01 && replayDeltaM < 0.01) return;
    if (replayDeltaM < 0.018 && serverDeltaM > 0.12 && pendingIntentCount > 0) return;
    doorDebugState.lastReconcileLogMs = nowMs;
    const radiusM = doorDebugState.radiusM;
    printDoorDebugJson("reconcile", {
      readThisFirst:
        "authoritativeVsPredicted_m is usually large while sprinting (server row lags unacked intents). " +
        "physicsReplayMismatch_m is the real correction |corr|; keep that small.",
      pendingIntentCount,
      predictedBefore: roundV(predictedBefore),
      authoritativeServer: {
        x: +serverRow.x.toFixed(3),
        y: +serverRow.y.toFixed(3),
        z: +serverRow.z.toFixed(3),
        velX: +serverRow.velX.toFixed(3),
        velY: +serverRow.velY.toFixed(3),
        velZ: +serverRow.velZ.toFixed(3),
        grounded: serverRow.grounded !== 0,
        seq: poseSeqAsBigint(serverRow.seq).toString(),
      },
      replayResolved: roundV(replayed),
      authoritativeVsPredicted: {
        x: +serverDelta.x.toFixed(3),
        y: +serverDelta.y.toFixed(3),
        z: +serverDelta.z.toFixed(3),
        meters: +serverDeltaM.toFixed(4),
      },
      physicsReplayMismatch: {
        x: +replayDelta.x.toFixed(3),
        y: +replayDelta.y.toFixed(3),
        z: +replayDelta.z.toFixed(3),
        meters: +replayDeltaM.toFixed(4),
      },
      bodyRadiusM: FP_PLAYER_COLLISION_RADIUS_M,
      bodyHeightM: crouch ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M : FP_PLAYER_COLLISION_HEIGHT_STAND_M,
      nearbyDoorsAtServer: snapshotDoorDebugAt(serverRow.x, serverRow.z, radiusM),
      nearbyDoorsAtReplay: snapshotDoorDebugAt(replayed.x, replayed.z, radiusM),
      staticOverlapsAtServer: snapshotStaticBodyOverlaps(serverRow, crouch),
      dynamicOverlapsAtServer: snapshotDynamicBodyOverlaps(serverRow, crouch),
      staticOverlapsAtReplay: snapshotStaticBodyOverlaps(replayed, crouch),
      dynamicOverlapsAtReplay: snapshotDynamicBodyOverlaps(replayed, crouch),
    });
  };

  const __mmDoorDebugApi = {
    on(radiusM = 2.5): void {
      doorDebugState.enabled = true;
      doorDebugState.radiusM = radiusM;
      printDoorDebugJson("status", {
        enabled: true,
        radiusM: +radiusM.toFixed(3),
        autostart: readDoorDebugAutostart(),
        message:
          "Walk at a door; logs appear on collision / movement near a door. Call __mmDoorDebug.off() to stop. " +
          "Also: localStorage mammothFpPhysicsDebug=1 (wireframe AABBs), mammothFpReconcileDebug=1, mammothFpDoorAnimSkewWarn=1.",
      });
    },
    off(): void {
      doorDebugState.enabled = false;
      printDoorDebugJson("status", {
        enabled: false,
        radiusM: +doorDebugState.radiusM.toFixed(3),
        autostart: readDoorDebugAutostart(),
      });
    },
    snapshot(radiusM = 2.5) {
      const payload = {
        player: roundV(pos),
        radiusM: +radiusM.toFixed(3),
        nearbyDoors: snapshotDoorDebug(radiusM),
      };
      printDoorDebugJson("snapshot", payload);
      return payload;
    },
    staticAabbs(radiusM = 2.5) {
      const payload = {
        player: roundV(pos),
        radiusM: +radiusM.toFixed(3),
        staticAabbs: snapshotStaticAabbs(radiusM),
      };
      printDoorDebugJson("static-aabbs", payload);
      return payload;
    },
    player(): { x: number; y: number; z: number } {
      const payload = { player: roundV(pos) };
      printDoorDebugJson("player", payload);
      return payload.player;
    },
    all(radiusM = 2.5): void {
      __mmDoorDebugApi.on(radiusM);
      printDoorDebugJson("all", {
        player: roundV(pos),
        radiusM: +radiusM.toFixed(3),
        nearbyDoors: snapshotDoorDebug(radiusM),
        staticAabbs: snapshotStaticAabbs(radiusM),
        autostart: readDoorDebugAutostart(),
      });
    },
    persistOn(radiusM = doorDebugState.radiusM): void {
      writeDoorDebugAutostart(true);
      __mmDoorDebugApi.all(radiusM);
      printDoorDebugJson("persist", { autostart: true, radiusM: +radiusM.toFixed(3) });
    },
    persistOff(): void {
      writeDoorDebugAutostart(false);
      printDoorDebugJson("persist", { autostart: false });
    },
  };
  (globalThis as unknown as { __mmDoorDebug?: typeof __mmDoorDebugApi }).__mmDoorDebug =
    __mmDoorDebugApi;
  if (readDoorDebugAutostart()) __mmDoorDebugApi.all(doorDebugState.radiusM);

  const printElevDebugJson = (label: string, payload: unknown): void => {
    console.log(`[mmElevDebug:${label}] ${JSON.stringify(payload, null, 2)}`);
  };

  const readElevDebugAutostart = (): boolean => {
    try {
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("elevdebug")) {
        return true;
      }
      return globalThis.localStorage?.getItem(MM_ELEV_DEBUG_AUTOSTART_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  };

  const writeElevDebugAutostart = (enabled: boolean): void => {
    try {
      if (enabled) globalThis.localStorage?.setItem(MM_ELEV_DEBUG_AUTOSTART_STORAGE_KEY, "1");
      else globalThis.localStorage?.removeItem(MM_ELEV_DEBUG_AUTOSTART_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  /** Scratch for `__mmElevDebug.snapshot()` only — keeps snapshot independent of the main-loop vectors. */
  const ctxFloorVisWorld = new THREE.Vector3();
  const ctxFloorVisDir = new THREE.Vector3();

  const __mmElevDebugApi = {
    on(opts?: { intervalMs?: number; hitchMs?: number; logSlowFramesAlways?: boolean }): void {
      __mmElevDebugState.enabled = true;
      if (opts?.intervalMs != null) __mmElevDebugState.intervalMs = Math.max(50, opts.intervalMs);
      if (opts?.hitchMs != null) __mmElevDebugState.hitchMs = Math.max(1, opts.hitchMs);
      __mmElevDebugState.logSlowFramesAlways = opts?.logSlowFramesAlways === true;
      __mmElevDebugState.lastPeriodicLogMs = 0;
      __mmElevDebugState.seenRideHud = false;
      __mmElevDebugState.hudMissStreak = 0;
      printElevDebugJson("status", {
        enabled: true,
        intervalMs: __mmElevDebugState.intervalMs,
        hitchMs: __mmElevDebugState.hitchMs,
        logSlowFramesAlways: __mmElevDebugState.logSlowFramesAlways,
        autostart: readElevDebugAutostart(),
        message:
          "Ride a moving cab; logs include prediction + floorVisBand. Slow frames while riding use hitchMs.",
      });
    },
    off(): void {
      __mmElevDebugState.enabled = false;
      __mmElevDebugState.seenRideHud = false;
      __mmElevDebugState.hudMissStreak = 0;
      printElevDebugJson("status", { enabled: false, autostart: readElevDebugAutostart() });
    },
    snapshot(): unknown {
      camera.getWorldPosition(ctxFloorVisWorld);
      camera.getWorldDirection(ctxFloorVisDir);
      const nowSnap = performance.now();
      const ride = fpElevators.sampleRideDebug(
        pos.x,
        pos.y,
        pos.z,
        nowSnap,
        ctxFloorVisWorld.y,
        ctxFloorVisDir.y,
      );
      const payload = {
        player: roundV(pos),
        ride,
        note: ride
          ? "Inside moving cab — fields match last frame’s eval time (call during ride for live data)."
          : "Not in a moving cab (or not inside HUD volume).",
      };
      printElevDebugJson("snapshot", payload);
      return payload;
    },
    all(opts?: { intervalMs?: number; hitchMs?: number; logSlowFramesAlways?: boolean }): void {
      __mmElevDebugApi.on(opts);
      __mmElevDebugApi.snapshot();
    },
    persistOn(opts?: { intervalMs?: number; hitchMs?: number; logSlowFramesAlways?: boolean }): void {
      writeElevDebugAutostart(true);
      __mmElevDebugApi.on(opts);
      printElevDebugJson("persist", { autostart: true });
    },
    persistOff(): void {
      writeElevDebugAutostart(false);
      printElevDebugJson("persist", { autostart: false });
    },
  };

  (globalThis as unknown as { __mmElevDebug?: typeof __mmElevDebugApi }).__mmElevDebug =
    __mmElevDebugApi;
  if (readElevDebugAutostart()) __mmElevDebugApi.on();

  const printWallProbeJson = (label: string, payload: unknown): void => {
    console.log(`[mmWallProbe:${label}] ${JSON.stringify(payload, null, 2)}`);
  };

  const readWallProbeAutostart = (): boolean => {
    try {
      return globalThis.localStorage?.getItem(MM_WALL_PROBE_AUTOSTART_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  };

  const writeWallProbeAutostart = (enabled: boolean): void => {
    try {
      if (enabled) globalThis.localStorage?.setItem(MM_WALL_PROBE_AUTOSTART_STORAGE_KEY, "1");
      else globalThis.localStorage?.removeItem(MM_WALL_PROBE_AUTOSTART_STORAGE_KEY);
    } catch {
      /* ignore storage failures */
    }
  };

  const dominantAxisLabel = (v: THREE.Vector3): "+x" | "-x" | "+y" | "-y" | "+z" | "-z" => {
    const ax = Math.abs(v.x);
    const ay = Math.abs(v.y);
    const az = Math.abs(v.z);
    if (ax >= ay && ax >= az) return v.x >= 0 ? "+x" : "-x";
    if (ay >= ax && ay >= az) return v.y >= 0 ? "+y" : "-y";
    return v.z >= 0 ? "+z" : "-z";
  };

  const surfaceKindFromNormal = (n: THREE.Vector3): "wall" | "floor" | "ceiling" => {
    if (n.y >= 0.7) return "floor";
    if (n.y <= -0.7) return "ceiling";
    return "wall";
  };

  const findAnnotatedAncestor = (
    obj: THREE.Object3D | null,
  ): { plateLevelIndex?: number; alwaysVisible?: boolean; name?: string } => {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (typeof cur.userData.mammothPlateLevelIndex === "number") {
        return {
          plateLevelIndex: cur.userData.mammothPlateLevelIndex as number,
          name: cur.name || undefined,
        };
      }
      if (cur.userData.mammothAlwaysVisible === true) {
        return { alwaysVisible: true, name: cur.name || undefined };
      }
      cur = cur.parent;
    }
    return {};
  };

  const snapshotWallProbePlayer = () => {
    camera.getWorldPosition(_wallProbeCamWorld);
    camera.getWorldDirection(_wallProbeCamDir);
    return {
      player: roundV(pos),
      camera: roundV(_wallProbeCamWorld),
      aimDirection: roundV(_wallProbeCamDir),
    };
  };

  const probeWallHit = (maxDistanceM = wallProbeState.maxDistanceM) => {
    camera.getWorldPosition(_wallProbeCamWorld);
    camera.getWorldDirection(_wallProbeCamDir);
    buildingRoot.updateMatrixWorld(true);
    _wallProbeRaycaster.set(_wallProbeCamWorld, _wallProbeCamDir);
    _wallProbeRaycaster.far = Math.max(0.5, maxDistanceM);
    const hits = _wallProbeRaycaster.intersectObject(buildingRoot, true);
    const hit = hits[0];
    if (!hit) {
      const miss = {
        ...snapshotWallProbePlayer(),
        maxDistanceM: +maxDistanceM.toFixed(3),
        hit: null,
      };
      printWallProbeJson("miss", miss);
      return miss;
    }

    const annotated = findAnnotatedAncestor(hit.object);
    const faceNormal = hit.face?.normal;
    if (faceNormal) {
      _wallProbeHitNormal.copy(faceNormal).transformDirection(hit.object.matrixWorld).normalize();
    } else {
      _wallProbeHitNormal.copy(_wallProbeCamDir).multiplyScalar(-1).normalize();
    }
    const plateLevelIndex = annotated.plateLevelIndex;
    const levelLabel =
      plateLevelIndex != null ? (floorLabelByLevel.get(plateLevelIndex) ?? String(plateLevelIndex)) : null;
    const buildingLocal = buildingRoot.worldToLocal(hit.point.clone());
    const plateAnchor =
      hit.object.parent && annotated.plateLevelIndex != null
        ? (() => {
            let cur: THREE.Object3D | null = hit.object;
            while (cur) {
              if (typeof cur.userData.mammothPlateLevelIndex === "number") return cur;
              cur = cur.parent;
            }
            return null;
          })()
        : null;
    const plateLocal = plateAnchor ? plateAnchor.worldToLocal(hit.point.clone()) : null;
    const payload = {
      ...snapshotWallProbePlayer(),
      maxDistanceM: +maxDistanceM.toFixed(3),
      hit: {
        pointWorld: roundV(hit.point),
        pointBuildingLocal: roundV(buildingLocal),
        pointPlateLocal: plateLocal ? roundV(plateLocal) : null,
        distanceM: +hit.distance.toFixed(3),
        normalWorld: roundV(_wallProbeHitNormal),
        dominantNormalAxis: dominantAxisLabel(_wallProbeHitNormal),
        surfaceKind: surfaceKindFromNormal(_wallProbeHitNormal),
        floorLevelIndex: plateLevelIndex ?? null,
        floorLabel: levelLabel,
        parentGroupName: annotated.name ?? null,
        alwaysVisibleColumn: annotated.alwaysVisible ?? false,
        objectName: hit.object.name || null,
      },
    };
    printWallProbeJson("hit", payload);
    return payload;
  };

  const __mmWallProbeApi = {
    on(maxDistanceM = wallProbeState.maxDistanceM): void {
      wallProbeState.enabled = true;
      wallProbeState.maxDistanceM = Math.max(0.5, maxDistanceM);
      printWallProbeJson("status", {
        enabled: true,
        maxDistanceM: +wallProbeState.maxDistanceM.toFixed(3),
        autostart: readWallProbeAutostart(),
        message:
          "Aim at a surface and right-click to print the crosshair hit. Call __mmWallProbe.off() to stop.",
      });
    },
    off(): void {
      wallProbeState.enabled = false;
      printWallProbeJson("status", {
        enabled: false,
        maxDistanceM: +wallProbeState.maxDistanceM.toFixed(3),
        autostart: readWallProbeAutostart(),
      });
    },
    probe(maxDistanceM = wallProbeState.maxDistanceM) {
      return probeWallHit(maxDistanceM);
    },
    player() {
      const payload = snapshotWallProbePlayer();
      printWallProbeJson("player", payload);
      return payload;
    },
    persistOn(maxDistanceM = wallProbeState.maxDistanceM): void {
      writeWallProbeAutostart(true);
      __mmWallProbeApi.on(maxDistanceM);
      printWallProbeJson("persist", {
        autostart: true,
        maxDistanceM: +wallProbeState.maxDistanceM.toFixed(3),
      });
    },
    persistOff(): void {
      writeWallProbeAutostart(false);
      printWallProbeJson("persist", { autostart: false });
    },
  };
  (globalThis as unknown as { __mmWallProbe?: typeof __mmWallProbeApi }).__mmWallProbe =
    __mmWallProbeApi;
  if (readWallProbeAutostart()) __mmWallProbeApi.on(wallProbeState.maxDistanceM);

  const tickElevDebug = (ctx: FpSessionElevDebugTickCtx): void => {
    if (!__mmElevDebugState.enabled) return;
    const {
      nowMs,
      dt,
      totalFrameMs,
      physicsMs,
      elevatorMs,
      presentMs,
      renderMs,
      playerPos,
      camera: cam,
      fpElevators: elev,
      displayOffset,
      playerRig,
      lastTickElevSupportVyMps,
      lastTickHudCabVyMps,
      lastTickElevVyBlendAbs,
      floorVisCamWorld,
      floorVisCamDir,
    } = ctx;
    cam.getWorldPosition(floorVisCamWorld);
    cam.getWorldDirection(floorVisCamDir);
    const ride = elev.sampleRideDebug(
      playerPos.x,
      playerPos.y,
      playerPos.z,
      nowMs,
      floorVisCamWorld.y,
      floorVisCamDir.y,
    );
    const riding = ride != null;
    if (riding) {
      __mmElevDebugState.hudMissStreak = 0;
      __mmElevDebugState.seenRideHud = true;
    } else if (__mmElevDebugState.seenRideHud) {
      __mmElevDebugState.hudMissStreak += 1;
      if (__mmElevDebugState.hudMissStreak >= ELEV_DEBUG_EXIT_DEBOUNCE_FRAMES) {
        printElevDebugJson("exit", {
          nowMs: +nowMs.toFixed(1),
          note: `No HUD cab sample for ${ELEV_DEBUG_EXIT_DEBOUNCE_FRAMES}+ frames (left car, docked, or phase idle).`,
        });
        __mmElevDebugState.hudMissStreak = 0;
        __mmElevDebugState.seenRideHud = false;
      }
    }
    const periodicDue =
      riding && nowMs - __mmElevDebugState.lastPeriodicLogMs >= __mmElevDebugState.intervalMs;
    const slowFrame = totalFrameMs >= __mmElevDebugState.hitchMs;
    const logSlow = slowFrame && (riding || __mmElevDebugState.logSlowFramesAlways);
    if (periodicDue || logSlow) {
      if (periodicDue) __mmElevDebugState.lastPeriodicLogMs = nowMs;
      const displayOffLen = Math.hypot(displayOffset.x, displayOffset.y, displayOffset.z);
      const rigMinusPhysicsY = playerRig.position.y - playerPos.y;
      printElevDebugJson("frame", {
        frameMs: +totalFrameMs.toFixed(2),
        dtSec: +dt.toFixed(4),
        slow: slowFrame,
        periodic: periodicDue,
        physicsMs: +physicsMs.toFixed(3),
        elevatorMs: +elevatorMs.toFixed(3),
        presentMs: +presentMs.toFixed(3),
        renderMs: +renderMs.toFixed(3),
        displayOffsetM: +displayOffLen.toFixed(4),
        rigMinusPhysicsY: +rigMinusPhysicsY.toFixed(4),
        offsetSpike: displayOffLen > 0.2,
        elevSupportVyMps: +lastTickElevSupportVyMps.toFixed(3),
        hudCabVyMps: +lastTickHudCabVyMps.toFixed(3),
        elevVyBlendAbs: +lastTickElevVyBlendAbs.toFixed(3),
        ride,
      });
    }
  };

  const dispose = (): void => {
    try {
      const g = globalThis as unknown as { __mmDoorDebug?: typeof __mmDoorDebugApi };
      if (g.__mmDoorDebug === __mmDoorDebugApi) delete g.__mmDoorDebug;
    } catch {
      /* ignore */
    }
    try {
      const g = globalThis as unknown as { __mmWallProbe?: typeof __mmWallProbeApi };
      if (g.__mmWallProbe === __mmWallProbeApi) delete g.__mmWallProbe;
    } catch {
      /* ignore */
    }
    try {
      const g = globalThis as unknown as { __mmElevDebug?: typeof __mmElevDebugApi };
      if (g.__mmElevDebug === __mmElevDebugApi) delete g.__mmElevDebug;
    } catch {
      /* ignore */
    }
  };

  return {
    doorDebugState,
    wallProbeState,
    logDoorDebugFrame,
    logDoorDebugReconcile,
    probeWallHit,
    tickElevDebug,
    dispose,
  };
}

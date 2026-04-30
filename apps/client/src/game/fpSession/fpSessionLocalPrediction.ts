import * as THREE from "three";
import type { CollisionAabb, CollisionSpatialIndex } from "@the-mammoth/world";
import {
  createFpLocomotionState,
  fpLocomotionConstants,
  stepFpLocomotion,
  type FpLocomotionInput,
  type FpLocomotionWalkOptions,
} from "@the-mammoth/engine";
import type { PlayerPose } from "../../module_bindings/types";
import {
  DISPLAY_HARD_SNAP_M,
  ELEV_MOVING_RIDER_RECONCILE_HORIZONTAL_MAX_M,
  ELEV_MOVING_RIDER_RECONCILE_SNAP_M,
  ELEV_MOVING_RIDER_RECONCILE_VERTICAL_ONLY_MAX_M,
  RECONCILE_MAX_CORRECTION_PER_POSE_M,
  RECONCILE_MAX_EXTRA_PER_HORIZONTAL_MPS,
} from "./fpSessionReconcileConstants.js";
import { decodeMoveIntentBitsInto } from "./moveIntentCodec.js";
import { poseSeqAsBigint } from "./fpSessionPoseSeq.js";
import {
  FP_PLAYER_COLLISION_HEIGHT_CROUCH_M,
  FP_PLAYER_COLLISION_HEIGHT_STAND_M,
  FP_PLAYER_COLLISION_RADIUS_M,
  resolvePlayerCollisions,
  type DynamicCollisionQueryPose,
} from "../fpPhysics/fpPlayerCollision.js";
import {
  clampAttachedBodyXZToKinematicSupportIfNeeded,
  getKinematicSupportVerticalVelocityMps,
  snapAttachedFeetToKinematicSupportIfNeeded,
  type FpKinematicSupportProvider,
  type FpKinematicSupportSampleOpts,
} from "../fpPhysics/fpKinematicSupport.js";

export type FpSessionPendingMoveIntent = {
  seq: bigint;
  bits: number;
  aimYaw: number;
  evalWallClockMs: number;
};

export type FpSessionMoveIntentQueue = {
  items: FpSessionPendingMoveIntent[];
  head: number;
};

type VisitCollisionAabbsInXZFn = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  visit: (aabb: CollisionAabb) => void,
  queryPose?: DynamicCollisionQueryPose,
) => void;

type ElevDoorCollisionHost = {
  visitCollisionAabbsInXZ: VisitCollisionAabbsInXZFn;
  syncCabEvalClock: (wallClockMs: number) => void;
  ignoreSmallPoseReconcileWhileMovingElevatorRider: (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
  ) => boolean;
  applyCabRoofFeetSnap: (
    pos: { x: number; y: number; z: number },
    prevPos: { y: number },
    bodyHeightM: number,
    footRadiusM: number,
  ) => boolean;
};
type ApartmentDoorCollisionHost = {
  visitCollisionAabbsInXZ: VisitCollisionAabbsInXZFn;
};
type RemotePlayerCollisionHost = {
  visitCollisionAabbsInXZ: VisitCollisionAabbsInXZFn;
};

export type FpSessionLocalPredictionDeps = {
  fpLocomotionConstants: Pick<
    typeof fpLocomotionConstants,
    "walkProbeDy" | "walkStepUpMargin" | "sprintSpeedMps"
  >;
  netDtSec: number;
  sampleWalkTopBase: (worldX: number, worldZ: number, probeTopY: number) => number;
  elevSupportEval: FpKinematicSupportSampleOpts;
  walkOpts: FpLocomotionWalkOptions;
  stepLocoStateRef: { current: ReturnType<typeof createFpLocomotionState> | null };
  /** Stable reference compared with `opts` for live-tick door debug attribution. */
  liveStepOpts: object;
  replayStepOpts: {
    pos: THREE.Vector3;
    prevPos: THREE.Vector3;
    locoState: ReturnType<typeof createFpLocomotionState>;
    input: FpLocomotionInput;
    dtSec: number;
    evalWallClockMs: number;
    crouch: boolean;
    jumpPressedThisFrame: boolean;
    bodyYawRad: number;
    kinematicSupport: FpKinematicSupportProvider;
  };
  replayPos: THREE.Vector3;
  replayPrevPos: THREE.Vector3;
  replayLoco: ReturnType<typeof createFpLocomotionState>;
  replayInput: FpLocomotionInput;
  reconcilePosBefore: THREE.Vector3;
  doorDebugState: { enabled: boolean };
  logDoorDebugFrame: (args: {
    prev: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    resolved: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    crouch: boolean;
  }) => void;
  logDoorDebugReconcile: (
    serverRow: PlayerPose,
    livePos: { x: number; y: number; z: number },
    replayPosForLog: { x: number; y: number; z: number },
    replayCrouch: boolean,
    pendingCount: number,
  ) => void;
  staticCollisionIndex: CollisionSpatialIndex;
  fpElevators: ElevDoorCollisionHost;
  fpApartmentDoors: ApartmentDoorCollisionHost;
  remotePlayers: RemotePlayerCollisionHost;
  elevatorWalkMergeSkipVy: number;
  elevatorRiderLockSkipUpwardVyMps: number;
  intentQueue: FpSessionMoveIntentQueue;
  keys: Set<string>;
  pos: THREE.Vector3;
  loco: ReturnType<typeof createFpLocomotionState>;
  displayOffset: THREE.Vector3;
  getCrouchToggle: () => boolean;
};

export type FpSessionPredictedPlayerStepOpts = {
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  locoState: ReturnType<typeof createFpLocomotionState>;
  input: FpLocomotionInput;
  dtSec: number;
  evalWallClockMs: number;
  crouch: boolean;
  jumpPressedThisFrame: boolean;
  bodyYawRad: number;
  kinematicSupport: FpKinematicSupportProvider;
};

export function createFpSessionLocalPrediction(deps: FpSessionLocalPredictionDeps) {
  const simulatePredictedPlayerStep = (
    opts: FpSessionPredictedPlayerStepOpts,
  ): number => {
    opts.prevPos.copy(opts.pos);
    const probeTopForElev = opts.pos.y + deps.fpLocomotionConstants.walkProbeDy;
    const baseForElev = deps.sampleWalkTopBase(opts.pos.x, opts.pos.z, probeTopForElev);
    deps.elevSupportEval.worldX = opts.pos.x;
    deps.elevSupportEval.worldZ = opts.pos.z;
    deps.elevSupportEval.probeTopY = probeTopForElev;
    deps.elevSupportEval.baseTop = baseForElev;
    deps.elevSupportEval.evalWallClockMs = opts.evalWallClockMs;
    const elevatorJumpVy =
      !opts.locoState.grounded || opts.locoState.velocity.y > deps.elevatorWalkMergeSkipVy
        ? 0
        : getKinematicSupportVerticalVelocityMps(
            opts.kinematicSupport,
            deps.elevSupportEval,
          );

    deps.stepLocoStateRef.current = opts.locoState;
    deps.walkOpts.jumpKinematicPlatformVyMps = elevatorJumpVy;
    deps.walkOpts.integrationEvalEndWallClockMs = opts.evalWallClockMs;
    const headY = stepFpLocomotion(
      opts.locoState,
      opts.pos,
      opts.bodyYawRad,
      opts.input,
      opts.dtSec,
      deps.walkOpts,
    );
    deps.stepLocoStateRef.current = null;

    snapAttachedFeetToKinematicSupportIfNeeded(
      opts.kinematicSupport,
      opts.pos,
      opts.locoState,
      {
        evalWallClockMs: opts.evalWallClockMs,
        jumpPressedThisFrame: opts.jumpPressedThisFrame,
        skipAttachUpwardVyMps: deps.elevatorRiderLockSkipUpwardVyMps,
      },
    );

    const dbg = deps.doorDebugState;
    const isLive = opts === deps.liveStepOpts;
    const dbgActive = dbg.enabled && isLive;
    const tgtX = opts.pos.x;
    const tgtZ = opts.pos.z;
    const tgtY = opts.pos.y;

    resolvePlayerCollisions(
      opts.pos,
      opts.prevPos,
      opts.locoState.velocity,
      opts.crouch,
      deps.fpLocomotionConstants.walkStepUpMargin,
      deps.staticCollisionIndex,
      {
        visitAabbsInXZ: (x0, x1, z0, z1, visit, queryPose) => {
          deps.fpElevators.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
          deps.fpApartmentDoors.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
          deps.remotePlayers.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
        },
      },
      opts.locoState.grounded,
    );

    if (dbgActive) {
      deps.logDoorDebugFrame({
        prev: { x: opts.prevPos.x, y: opts.prevPos.y, z: opts.prevPos.z },
        target: { x: tgtX, y: tgtY, z: tgtZ },
        resolved: { x: opts.pos.x, y: opts.pos.y, z: opts.pos.z },
        velocity: {
          x: opts.locoState.velocity.x,
          y: opts.locoState.velocity.y,
          z: opts.locoState.velocity.z,
        },
        crouch: opts.crouch,
      });
    }

    const bodyH = opts.crouch
      ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M
      : FP_PLAYER_COLLISION_HEIGHT_STAND_M;
    if (
      deps.fpElevators.applyCabRoofFeetSnap(
        opts.pos,
        { y: opts.prevPos.y },
        bodyH,
        FP_PLAYER_COLLISION_RADIUS_M,
      )
    ) {
      opts.locoState.velocity.y = 0;
      opts.locoState.grounded = true;
    }

    clampAttachedBodyXZToKinematicSupportIfNeeded(
      opts.kinematicSupport,
      opts.pos,
      opts.locoState,
      opts.evalWallClockMs,
    );

    return headY;
  };

  const reconcileLocalPredictionToServer = (serverRow: PlayerPose) => {
    const serverSeq = poseSeqAsBigint(serverRow.seq);
    const q = deps.intentQueue;
    while (q.head < q.items.length && q.items[q.head]!.seq <= serverSeq) {
      q.head++;
    }
    if (q.head >= q.items.length) {
      q.items.length = 0;
      q.head = 0;
    } else if (q.head >= 16) {
      q.items.splice(0, q.head);
      q.head = 0;
    }

    const alignHintMs = performance.now();
    const inputIdleRecon =
      !deps.keys.has("KeyW") &&
      !deps.keys.has("KeyS") &&
      !deps.keys.has("KeyA") &&
      !deps.keys.has("KeyD");
    const onMovingElevatorRider =
      deps.fpElevators.ignoreSmallPoseReconcileWhileMovingElevatorRider(
        deps.pos.x,
        deps.pos.y,
        deps.pos.z,
        alignHintMs,
      );
    const skipFootPoseReconcile = inputIdleRecon && !onMovingElevatorRider;
    if (skipFootPoseReconcile) {
      const rough = Math.hypot(
        serverRow.x - deps.pos.x,
        serverRow.y - deps.pos.y,
        serverRow.z - deps.pos.z,
      );
      if (rough <= DISPLAY_HARD_SNAP_M) {
        return;
      }
    }

    deps.reconcilePosBefore.copy(deps.pos);

    const pendingCount = q.items.length - q.head;

    let replayPosForLog: { x: number; y: number; z: number };
    let crouchForLog: boolean;
    const ro = deps.replayStepOpts;

    if (pendingCount > 0) {
      deps.replayPos.set(serverRow.x, serverRow.y, serverRow.z);
      deps.replayPrevPos.copy(deps.replayPos);
      deps.replayLoco.velocity.set(serverRow.velX, serverRow.velY, serverRow.velZ);
      deps.replayLoco.grounded = serverRow.grounded !== 0;
      deps.replayLoco.jumpQueued = false;

      for (let i = q.head; i < q.items.length; i++) {
        const sample = q.items[i]!;
        const stepNowMs = sample.evalWallClockMs;
        const isLast = i === q.items.length - 1;
        let stepDt = deps.netDtSec;
        if (isLast) {
          const wallSec = (alignHintMs - stepNowMs) * 0.001;
          stepDt = Math.min(deps.netDtSec, Math.max(wallSec, 0.001));
        }
        deps.fpElevators.syncCabEvalClock(stepNowMs);
        decodeMoveIntentBitsInto(sample.bits, deps.replayInput);
        ro.evalWallClockMs = stepNowMs;
        ro.dtSec = stepDt;
        ro.crouch = (sample.bits & 64) !== 0;
        ro.jumpPressedThisFrame = (sample.bits & 16) !== 0;
        ro.bodyYawRad = sample.aimYaw;
        simulatePredictedPlayerStep(ro);
      }
      replayPosForLog = { x: deps.replayPos.x, y: deps.replayPos.y, z: deps.replayPos.z };
      crouchForLog = ro.crouch;
    } else {
      deps.replayLoco.velocity.set(serverRow.velX, serverRow.velY, serverRow.velZ);
      deps.replayLoco.grounded = serverRow.grounded !== 0;
      replayPosForLog = { x: serverRow.x, y: serverRow.y, z: serverRow.z };
      crouchForLog = deps.getCrouchToggle();
    }

    const corrX =
      pendingCount > 0 ? deps.replayPos.x - deps.pos.x : serverRow.x - deps.pos.x;
    const corrY =
      pendingCount > 0 ? deps.replayPos.y - deps.pos.y : serverRow.y - deps.pos.y;
    const corrZ =
      pendingCount > 0 ? deps.replayPos.z - deps.pos.z : serverRow.z - deps.pos.z;
    const corrDist = Math.hypot(corrX, corrY, corrZ);
    const corrHorizontalDist = Math.hypot(corrX, corrZ);
    const ridingMovingElevatorNow =
      deps.fpElevators.ignoreSmallPoseReconcileWhileMovingElevatorRider(
        deps.pos.x,
        deps.pos.y,
        deps.pos.z,
        alignHintMs,
      );
    const ignoreSmallElevRiderPhantom =
      ridingMovingElevatorNow && corrDist < ELEV_MOVING_RIDER_RECONCILE_SNAP_M;
    const ignoreElevRiderVerticalTimelineMismatch =
      ridingMovingElevatorNow &&
      corrHorizontalDist <= ELEV_MOVING_RIDER_RECONCILE_HORIZONTAL_MAX_M &&
      Math.abs(corrY) <= ELEV_MOVING_RIDER_RECONCILE_VERTICAL_ONLY_MAX_M;
    const ignoreElevRiderReconcile =
      ignoreSmallElevRiderPhantom || ignoreElevRiderVerticalTimelineMismatch;
    deps.logDoorDebugReconcile(
      serverRow,
      { x: deps.pos.x, y: deps.pos.y, z: deps.pos.z },
      replayPosForLog,
      crouchForLog,
      pendingCount,
    );

    if (corrDist > DISPLAY_HARD_SNAP_M && !ignoreElevRiderVerticalTimelineMismatch) {
      if (pendingCount > 0) {
        deps.pos.copy(deps.replayPos);
      } else {
        deps.pos.set(serverRow.x, serverRow.y, serverRow.z);
      }
      deps.displayOffset.set(0, 0, 0);
      deps.loco.velocity.copy(deps.replayLoco.velocity);
      deps.loco.grounded = deps.replayLoco.grounded;
    } else if (corrDist > 0.001 && !ignoreElevRiderReconcile) {
      const hs = Math.hypot(deps.loco.velocity.x, deps.loco.velocity.z);
      const reconcileMaxM =
        RECONCILE_MAX_CORRECTION_PER_POSE_M +
        Math.min(hs, deps.fpLocomotionConstants.sprintSpeedMps) *
          RECONCILE_MAX_EXTRA_PER_HORIZONTAL_MPS;
      const t = Math.min(1, reconcileMaxM / corrDist);
      deps.pos.x += corrX * t;
      deps.pos.y += corrY * t;
      deps.pos.z += corrZ * t;
      deps.displayOffset.x -= corrX * t;
      deps.displayOffset.y -= corrY * t;
      deps.displayOffset.z -= corrZ * t;
      deps.loco.velocity.lerp(deps.replayLoco.velocity, t);
      deps.loco.grounded = deps.replayLoco.grounded;
    } else {
      deps.loco.velocity.copy(deps.replayLoco.velocity);
      deps.loco.grounded = deps.replayLoco.grounded;
    }

    if (deps.pos.distanceToSquared(deps.reconcilePosBefore) > 1e-10) {
      resolvePlayerCollisions(
        deps.pos,
        deps.reconcilePosBefore,
        deps.loco.velocity,
        deps.getCrouchToggle(),
        deps.fpLocomotionConstants.walkStepUpMargin,
        deps.staticCollisionIndex,
        {
          visitAabbsInXZ: (x0, x1, z0, z1, visit, queryPose) => {
            deps.fpElevators.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
            deps.fpApartmentDoors.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
            deps.remotePlayers.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
          },
        },
        deps.loco.grounded,
      );
    }
  };

  return { simulatePredictedPlayerStep, reconcileLocalPredictionToServer };
}

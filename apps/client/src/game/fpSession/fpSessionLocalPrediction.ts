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
export type ApartmentDoorCollisionHost = {
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
  /** Owned-apartment partition slabs + mounted interior authoring boxes (runtime meshes). */
  fpInteriorPartitionSolids?: ApartmentDoorCollisionHost;
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
  const { fpInteriorPartitionSolids } = deps;
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
          fpInteriorPartitionSolids?.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
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
    /** Solo Mammoth: server mirrors trusted snapshots — do not replay intents or rubber-band `pos`. */
    void serverRow;
  };

  return { simulatePredictedPlayerStep, reconcileLocalPredictionToServer };
}

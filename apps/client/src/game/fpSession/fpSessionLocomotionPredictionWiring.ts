import * as THREE from "three";
import {
  createFpLocomotionState,
  fpLocomotionConstants,
  type FpLocomotionInput,
  type FpLocomotionWalkOptions,
} from "@the-mammoth/engine";
import type { PlayerPose } from "../../module_bindings/types";
import {
  mergeKinematicSupportTop,
  type FpKinematicSupportSampleOpts,
} from "../fpPhysics/fpKinematicSupport.js";
import type { MountFpApartmentDoorsResult } from "../fpApartment/fpApartmentDoors.js";
import type { MountFpElevatorWorldResult } from "../fpElevator/fpElevatorWorld.js";
import type { FpSessionStaticWorld } from "./fpSessionWorldMount.js";
import type { FpDynamicLocomotionBlockerHost } from "../fpPhysics/fpDynamicLocomotionBlockerChain.js";
import {
  createFpSessionLocalPrediction,
  type FpSessionMoveIntentQueue,
} from "./fpSessionLocalPrediction.js";
import type { FpSessionDoorDebugState } from "./fpSessionDevDebugApis.js";
import type { FpSessionMainRafState, FpSessionMainStepOpts } from "./fpSessionMainRafFrame.js";

/**
 * While rising from a real jump, skip elevator cab walk merge — otherwise `mergeWalkTop` keeps the
 * cab as the highest support and locomotion snaps feet back to the floor every substep.
 * Must stay **well above** upward velocity from a rising cab (~3 m/s) or merge drops for whole frames.
 */
const ELEVATOR_WALK_MERGE_SKIP_VY = 2.0;

export type WireFpSessionLocomotionPredictionArgs = {
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  loco: ReturnType<typeof createFpLocomotionState>;
  keys: Set<string>;
  _input: FpLocomotionInput;
  _replayInput: FpLocomotionInput;
  _replayPos: THREE.Vector3;
  _replayPrevPos: THREE.Vector3;
  _replayLoco: ReturnType<typeof createFpLocomotionState>;
  _reconcilePosBefore: THREE.Vector3;
  moveIntentQueue: FpSessionMoveIntentQueue;
  mainRaf: FpSessionMainRafState;
  displayOffset: THREE.Vector3;
  netDtSec: number;
  sampleWalkTopBase: (
    worldX: number,
    worldZ: number,
    probeTopY: number,
    sampleOpts?: import("@the-mammoth/world").SampleWalkGroundOpts,
  ) => number;
  fpElevators: MountFpElevatorWorldResult;
  fpApartmentDoors: MountFpApartmentDoorsResult;
  fpDynamicLocomotionBlockers: FpDynamicLocomotionBlockerHost;
  staticCollisionIndex: FpSessionStaticWorld["staticCollisionIndex"];
  doorDebugState: FpSessionDoorDebugState;
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
  elevatorRiderLockSkipUpwardVyMps: number;
};

export type WiredFpSessionLocomotionPrediction = {
  _mainStepOpts: FpSessionMainStepOpts;
  _elevSupportEval: FpKinematicSupportSampleOpts;
  _walkOpts: FpLocomotionWalkOptions;
  simulatePredictedPlayerStep: (opts: FpSessionMainStepOpts) => number;
  reconcileLocalPredictionToServer: (row: PlayerPose) => void;
};

/**
 * Allocates walk-support scratch objects, hooks kinematic merge sampling, and wires
 * {@link createFpSessionLocalPrediction} to the session pools.
 */
export function wireFpSessionLocomotionPrediction(
  args: WireFpSessionLocomotionPredictionArgs,
): WiredFpSessionLocomotionPrediction {
  const {
    pos,
    prevPos,
    loco,
    keys,
    _input,
    _replayInput,
    _replayPos,
    _replayPrevPos,
    _replayLoco,
    _reconcilePosBefore,
    moveIntentQueue,
    mainRaf,
    displayOffset,
    netDtSec,
    sampleWalkTopBase,
    fpElevators,
    fpApartmentDoors,
    fpDynamicLocomotionBlockers,
    staticCollisionIndex,
    doorDebugState,
    logDoorDebugFrame,
    logDoorDebugReconcile,
    elevatorRiderLockSkipUpwardVyMps,
  } = args;

  const _walkSupportEval: FpKinematicSupportSampleOpts = {
    worldX: 0,
    worldZ: 0,
    probeTopY: 0,
    footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
    stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
    baseTop: 0,
  };

  const _elevSupportEval: FpKinematicSupportSampleOpts = {
    worldX: 0,
    worldZ: 0,
    probeTopY: 0,
    footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
    stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
    baseTop: 0,
  };

  const _stepLocoStateRef: {
    current: ReturnType<typeof createFpLocomotionState> | null;
  } = { current: null };

  const _walkDescentProbeRef = { current: false };
  const _walkSampleOpts = {
    footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
    stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
    maxSupportDropBelowFeetM: fpLocomotionConstants.walkMaxSupportDropM,
    descentProbe: false,
  };

  const sampleWalkTopForVelocityY = (
    velocityY: number,
    worldX: number,
    worldZ: number,
    probeTopY: number,
    evalWallClockMs?: number,
  ) => {
    _walkSampleOpts.descentProbe = _walkDescentProbeRef.current;
    const base = sampleWalkTopBase(worldX, worldZ, probeTopY, _walkSampleOpts);
    if (velocityY > ELEVATOR_WALK_MERGE_SKIP_VY || _walkDescentProbeRef.current) {
      return base;
    }
    _walkSupportEval.worldX = worldX;
    _walkSupportEval.worldZ = worldZ;
    _walkSupportEval.probeTopY = probeTopY;
    _walkSupportEval.baseTop = base;
    _walkSupportEval.evalWallClockMs = evalWallClockMs;
    return mergeKinematicSupportTop(fpElevators.kinematicSupport, _walkSupportEval);
  };

  const _walkOpts: FpLocomotionWalkOptions = {
    descentProbeRef: _walkDescentProbeRef,
    sampleWalkGroundTopY: (worldX, worldZ, probeTopY, evalWallClockMs) =>
      sampleWalkTopForVelocityY(
        _stepLocoStateRef.current!.velocity.y,
        worldX,
        worldZ,
        probeTopY,
        evalWallClockMs,
      ),
    probeDy: fpLocomotionConstants.walkProbeDy,
    maxSupportDropM: fpLocomotionConstants.walkMaxSupportDropM,
    jumpKinematicPlatformVyMps: 0,
    integrationEvalEndWallClockMs: undefined,
  };

  const _mainStepOpts: FpSessionMainStepOpts = {
    pos,
    prevPos,
    locoState: loco,
    input: _input,
    dtSec: 0,
    evalWallClockMs: 0,
    crouch: false,
    jumpPressedThisFrame: false,
    bodyYawRad: 0,
    kinematicSupport: fpElevators.kinematicSupport,
  };

  const _replayStepOpts = {
    pos: _replayPos,
    prevPos: _replayPrevPos,
    locoState: _replayLoco,
    input: _replayInput,
    dtSec: netDtSec,
    evalWallClockMs: 0,
    crouch: false,
    jumpPressedThisFrame: false,
    bodyYawRad: 0,
    kinematicSupport: fpElevators.kinematicSupport,
  };

  const { simulatePredictedPlayerStep, reconcileLocalPredictionToServer } =
    createFpSessionLocalPrediction({
      fpLocomotionConstants: {
        walkProbeDy: fpLocomotionConstants.walkProbeDy,
        walkStepUpMargin: fpLocomotionConstants.walkStepUpMargin,
        walkMaxSupportDropM: fpLocomotionConstants.walkMaxSupportDropM,
        sprintSpeedMps: fpLocomotionConstants.sprintSpeedMps,
      },
      netDtSec,
      sampleWalkTopBase,
      elevSupportEval: _elevSupportEval,
      walkOpts: _walkOpts,
      stepLocoStateRef: _stepLocoStateRef,
      liveStepOpts: _mainStepOpts,
      replayStepOpts: _replayStepOpts,
      replayPos: _replayPos,
      replayPrevPos: _replayPrevPos,
      replayLoco: _replayLoco,
      replayInput: _replayInput,
      reconcilePosBefore: _reconcilePosBefore,
      doorDebugState,
      logDoorDebugFrame,
      logDoorDebugReconcile,
      staticCollisionIndex,
      fpElevators,
      fpDynamicLocomotionBlockers,
      elevatorWalkMergeSkipVy: ELEVATOR_WALK_MERGE_SKIP_VY,
      elevatorRiderLockSkipUpwardVyMps,
      intentQueue: moveIntentQueue,
      keys,
      pos,
      loco,
      displayOffset,
      getCrouchToggle: () => mainRaf.crouchToggle,
    });

  return {
    _mainStepOpts,
    _elevSupportEval,
    _walkOpts,
    simulatePredictedPlayerStep,
    reconcileLocalPredictionToServer,
  };
}

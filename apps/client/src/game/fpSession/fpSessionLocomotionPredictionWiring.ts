import * as THREE from "three";
import {
  createFpLocomotionState,
  FP_ELEVATOR_WALK_MERGE_SKIP_VY,
  FP_LOCOMOTION_AIRBORNE_SUBSTEP_SCALE,
  FP_LOCOMOTION_SUBSTEPS_PER_SECOND,
  fpLocomotionConstants,
  type FpLocomotionInput,
  type FpLocomotionWalkOptions,
} from "@the-mammoth/engine";
import type { PlayerPose } from "../../module_bindings/types";
import type { SampleWalkGroundOpts } from "@the-mammoth/world";
import type { FpKinematicSupportSampleOpts } from "../fpPhysics/fpKinematicSupport.js";
import type { MountFpApartmentDoorsResult } from "../fpApartment/fpApartmentDoors.js";
import type { MountFpElevatorWorldResult } from "../fpElevator/fpElevatorWorld.js";
import type { FpSessionStaticWorld } from "./fpSessionWorldMount.js";
import type { FpDynamicLocomotionBlockerHost } from "./fpSessionLocalPrediction.js";
import {
  createFpSessionLocalPrediction,
  type FpSessionMoveIntentQueue,
} from "./fpSessionLocalPrediction.js";
import type { FpSessionDoorDebugState } from "./fpSessionDevDebugApis.js";
import type { FpSessionMainRafState, FpSessionMainStepOpts } from "./fpSessionMainRafFrame.js";
import {
  createQuantizedWalkSampleCache,
  createSessionWalkGroundSampler,
} from "./fpSessionWalkGroundSampler.js";

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
    sampleOpts?: SampleWalkGroundOpts,
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

  const sessionWalkSampler = createSessionWalkGroundSampler({
    sampleWalkTopBase,
    kinematicSupport: fpElevators.kinematicSupport,
    kinematicSupportEval: _walkSupportEval,
    velocityYMps: () => _stepLocoStateRef.current?.velocity.y ?? 0,
  });

  const _walkOpts: FpLocomotionWalkOptions = {
    sampleWalkGroundTopY: createQuantizedWalkSampleCache(sessionWalkSampler),
    substepsForDt: (dtSec, state) => {
      const scale = state.grounded ? 1 : FP_LOCOMOTION_AIRBORNE_SUBSTEP_SCALE;
      return Math.max(
        1,
        Math.min(50, Math.round(FP_LOCOMOTION_SUBSTEPS_PER_SECOND * dtSec * scale)),
      );
    },
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
      elevatorWalkMergeSkipVy: FP_ELEVATOR_WALK_MERGE_SKIP_VY,
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

import {
  fpLocomotionConstants,
  shouldMergeElevatorWalkSupport,
  type WalkGroundSampler,
} from "@the-mammoth/engine";
import type { SampleWalkGroundOpts } from "@the-mammoth/world";
import {
  mergeKinematicSupportTop,
  type FpKinematicSupportProvider,
  type FpKinematicSupportSampleOpts,
} from "../fpPhysics/fpKinematicSupport.js";

/** Per-integration-step cache — keeps hot descent frames from re-querying identical probes. */
export function createQuantizedWalkSampleCache(base: WalkGroundSampler): WalkGroundSampler {
  let lastKey = 0;
  let lastTop = Number.NaN;
  return (worldX, worldZ, probeTopY, phase, evalWallClockMs) => {
    const qx = Math.round(worldX * 100);
    const qz = Math.round(worldZ * 100);
    const qp = Math.round(probeTopY * 40);
    const key =
      qx * 73856093 +
      qz * 19349663 +
      qp * 83492791 +
      (phase === "descent" ? 1 : phase === "skip" ? 2 : 0);
    if (key === lastKey) return lastTop;
    lastKey = key;
    lastTop = base(worldX, worldZ, probeTopY, phase, evalWallClockMs);
    return lastTop;
  };
}

export type SessionWalkGroundSamplerArgs = {
  sampleWalkTopBase: (
    worldX: number,
    worldZ: number,
    probeTopY: number,
    sampleOpts?: SampleWalkGroundOpts,
  ) => number;
  kinematicSupport: FpKinematicSupportProvider;
  kinematicSupportEval: FpKinematicSupportSampleOpts;
  velocityYMps: () => number;
};

/** Maps probe phase → world opts + optional elevator merge. */
export function createSessionWalkGroundSampler(
  args: SessionWalkGroundSamplerArgs,
): WalkGroundSampler {
  const walkSampleOpts: SampleWalkGroundOpts = {
    footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
    stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
    maxSupportDropBelowFeetM: fpLocomotionConstants.walkMaxSupportDropM,
    descentProbe: false,
  };

  return (worldX, worldZ, probeTopY, phase, evalWallClockMs) => {
    if (phase === "skip") return Number.NaN;

    walkSampleOpts.descentProbe = phase === "descent";
    const base = args.sampleWalkTopBase(worldX, worldZ, probeTopY, walkSampleOpts);
    const vy = args.velocityYMps();
    if (!shouldMergeElevatorWalkSupport(phase, vy)) return base;

    const evalOpts = args.kinematicSupportEval;
    evalOpts.worldX = worldX;
    evalOpts.worldZ = worldZ;
    evalOpts.probeTopY = probeTopY;
    evalOpts.baseTop = base;
    evalOpts.evalWallClockMs = evalWallClockMs;
    return mergeKinematicSupportTop(args.kinematicSupport, evalOpts);
  };
}

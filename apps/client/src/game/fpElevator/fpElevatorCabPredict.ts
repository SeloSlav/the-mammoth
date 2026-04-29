import { ELEVATOR_MOVE_SPEED_MPS } from "./fpElevatorConstants.js";

/** Match `apps/server/src/elevator/mod.rs` smoothstep on `move_u`. */
export function elevatorMoveSmoothstep01(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}

/**
 * Predict world-space cab feet Y while `phase == PH_MOVING`, using the same easing + duration
 * as the server so client frames stay aligned between 20 Hz `elevator_car` row updates.
 */
export function predictMovingCabFeetWorldY(opts: {
  moveFromLevel: number;
  moveToLevel: number;
  moveUAtReplica: number;
  elapsedSecSinceReplica: number;
  feetYForLevel: (level: number) => number;
  moveSpeedMps?: number;
}): number {
  const speed = opts.moveSpeedMps ?? ELEVATOR_MOVE_SPEED_MPS;
  const y0 = opts.feetYForLevel(opts.moveFromLevel);
  const y1 = opts.feetYForLevel(opts.moveToLevel);
  const dist = Math.abs(y1 - y0);
  const need = Math.max(1e-4, dist / Math.max(0.08, speed));
  const u = Math.min(1, opts.moveUAtReplica + opts.elapsedSecSinceReplica / need);
  const s = elevatorMoveSmoothstep01(u);
  return y0 + (y1 - y0) * s;
}

/** Same inputs as {@link predictMovingCabFeetWorldY} — d(feetY)/dt (m/s) for moving phase. */
export function predictMovingCabFeetWorldYVelocityMps(opts: {
  moveFromLevel: number;
  moveToLevel: number;
  moveUAtReplica: number;
  elapsedSecSinceReplica: number;
  feetYForLevel: (level: number) => number;
  moveSpeedMps?: number;
}): number {
  const speed = opts.moveSpeedMps ?? ELEVATOR_MOVE_SPEED_MPS;
  const y0 = opts.feetYForLevel(opts.moveFromLevel);
  const y1 = opts.feetYForLevel(opts.moveToLevel);
  const dy = y1 - y0;
  const dist = Math.abs(dy);
  const need = Math.max(1e-4, dist / Math.max(0.08, speed));
  const uRaw = opts.moveUAtReplica + opts.elapsedSecSinceReplica / need;
  if (uRaw <= 0 || uRaw >= 1) {
    return 0;
  }
  const u = Math.min(1, Math.max(0, uRaw));
  const dsDu = 6 * u * (1 - u);
  return dy * dsDu * (1 / need);
}

/**
 * Advance the live client-side move parameter for a moving cab.
 *
 * Unlike a plain low-pass toward the newest replica-derived target, this keeps the local `u`
 * monotone within a move leg: the cab should never move backward because clock-offset or packet
 * jitter made the target dip for one frame.
 */
export function advanceSmoothedMovingCabU(opts: {
  prevSmoothedU: number | undefined;
  authoritativeMoveU: number;
  targetU: number;
  dtSec: number;
  moveDurationSec: number;
  correctionPerS?: number;
  correctionDeadzoneSec?: number;
}): number {
  const correctionPerS = opts.correctionPerS ?? 6;
  const correctionDeadzoneSec = opts.correctionDeadzoneSec ?? 0.012;
  const moveDurationSec = Math.max(1e-4, opts.moveDurationSec);
  const targetU = Math.min(1, Math.max(opts.authoritativeMoveU, opts.targetU));
  if (!(opts.dtSec > 0) || !Number.isFinite(opts.dtSec)) {
    return targetU;
  }
  const prev = opts.prevSmoothedU ?? targetU;
  const predicted = Math.min(1, Math.max(opts.authoritativeMoveU, prev + opts.dtSec / moveDurationSec));
  const deadzoneU = correctionDeadzoneSec / moveDurationSec;
  const errorU = targetU - predicted;
  const blend = 1 - Math.exp(-correctionPerS * opts.dtSec);
  const corrected =
    Math.abs(errorU) <= deadzoneU
      ? predicted
      : predicted + (errorU - Math.sign(errorU) * deadzoneU) * blend;
  return Math.min(1, Math.max(prev, opts.authoritativeMoveU, corrected));
}

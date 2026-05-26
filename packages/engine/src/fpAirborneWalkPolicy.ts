/** Skip walk AABB probes while rising — landing only matters once vy <= 0. */
export const FP_JUMP_ASCENT_SKIP_WALK_PROBE_VY = 0.08;

/**
 * While rising from a real jump, skip elevator cab walk merge — otherwise merge keeps the cab as
 * highest support and snaps feet back to the floor every substep. Stay well above rising-cab vy (~3 m/s).
 */
export const FP_ELEVATOR_WALK_MERGE_SKIP_VY = 2.0;

/** Fewer integration substeps while airborne — walk probes are the hot path on descent. */
export const FP_LOCOMOTION_AIRBORNE_SUBSTEP_SCALE = 0.35;

export type FpWalkProbePhase = "skip" | "ground" | "descent";

/** Explicit walk-probe mode for one locomotion substep. */
export function resolveFpWalkProbePhase(
  grounded: boolean,
  velocityYMps: number,
): FpWalkProbePhase {
  if (grounded) return "ground";
  if (velocityYMps > FP_JUMP_ASCENT_SKIP_WALK_PROBE_VY) return "skip";
  return "descent";
}

export function shouldMergeElevatorWalkSupport(
  phase: FpWalkProbePhase,
  velocityYMps: number,
): boolean {
  if (phase === "descent" || phase === "skip") return false;
  if (velocityYMps > FP_ELEVATOR_WALK_MERGE_SKIP_VY) return false;
  return true;
}

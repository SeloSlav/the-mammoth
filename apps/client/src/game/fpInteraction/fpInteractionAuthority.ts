export type FpInteractionPose = {
  x: number;
  y: number;
  z: number;
};

/**
 * Interaction prompts and E-key volumes should track the **predicted** body: the server pose can lag
 * replication by several ticks. Switching to authority on large drift (previous behavior) kept
 * interact queries at the old spot — e.g. corridor-door HUD stuck after walking away.
 *
 * Still returns the same reference as {@link localPose} / {@link serverPose} when they coincide
 * so callers that rely on identity (tests, tiny setups) behave unchanged.
 */
export function resolveAuthoritativeInteractionPose(
  localPose: FpInteractionPose,
  _serverPose: FpInteractionPose,
): FpInteractionPose {
  return localPose;
}

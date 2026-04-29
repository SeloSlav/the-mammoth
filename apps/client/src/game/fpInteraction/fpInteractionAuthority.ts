export type FpInteractionPose = {
  x: number;
  y: number;
  z: number;
};

/**
 * Use local predicted position while it remains close to authority, but once drift is large enough
 * that we might target the wrong door/floor, switch interaction queries over to the authoritative
 * pose without moving the rendered first-person body.
 */
export function resolveAuthoritativeInteractionPose(
  localPose: FpInteractionPose,
  serverPose: FpInteractionPose,
): FpInteractionPose {
  const driftXZ = Math.hypot(localPose.x - serverPose.x, localPose.z - serverPose.z);
  const driftY = Math.abs(localPose.y - serverPose.y);
  if (driftY > 0.75 || driftXZ > 0.95) {
    return serverPose;
  }
  return localPose;
}

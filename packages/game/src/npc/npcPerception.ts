/** Authoritative NPC idle→aggro perception — profile-driven, archetype-agnostic. */
export type NpcPerceptionProfile = {
  aggroRangeM: number;
  /** Half-width of the forward vision cone (radians). Total FOV = 2× this value. */
  visionHalfAngleRad: number;
  /** Planar aggro radius multiplier while the target player is crouched. */
  crouchDetectionRangeMul: number;
};

export function npcCrouchAggroRangeM(profile: NpcPerceptionProfile): number {
  return profile.aggroRangeM * profile.crouchDetectionRangeMul;
}

export function npcDetectionRangeM(
  profile: NpcPerceptionProfile,
  playerCrouching: boolean,
): number {
  return playerCrouching
    ? npcCrouchAggroRangeM(profile)
    : profile.aggroRangeM;
}

export function npcInVisionCone(
  profile: NpcPerceptionProfile,
  npcYawRad: number,
  toPlayerX: number,
  toPlayerZ: number,
  distSq: number,
): boolean {
  if (distSq < 1e-8) return true;
  const invDist = 1 / Math.sqrt(distSq);
  const dirX = toPlayerX * invDist;
  const dirZ = toPlayerZ * invDist;
  const fwdX = Math.sin(npcYawRad);
  const fwdZ = Math.cos(npcYawRad);
  const dot = dirX * fwdX + dirZ * fwdZ;
  return dot >= Math.cos(profile.visionHalfAngleRad);
}

export function npcPlayerDetectable(args: {
  profile: NpcPerceptionProfile;
  npcYawRad: number;
  toPlayerX: number;
  toPlayerZ: number;
  distSq: number;
  playerCrouching: boolean;
}): boolean {
  const rangeM = npcDetectionRangeM(args.profile, args.playerCrouching);
  if (args.distSq > rangeM * rangeM) return false;
  return npcInVisionCone(
    args.profile,
    args.npcYawRad,
    args.toPlayerX,
    args.toPlayerZ,
    args.distSq,
  );
}

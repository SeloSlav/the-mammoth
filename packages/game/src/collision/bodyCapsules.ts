/** Authoritative gameplay capsule dimensions — keep `apps/server` constants aligned. */

export const PLAYER_BODY_RADIUS_M = 0.22;
export const PLAYER_BODY_HEIGHT_STAND_M = 1.78;
export const PLAYER_BODY_HEIGHT_CROUCH_M = 1.2;

export const BABUSHKA_BODY_RADIUS_M = 0.28;
export const BABUSHKA_BODY_HEIGHT_M = 1.55;

/** Surface gap between resolved capsule pairs (player↔NPC, NPC↔NPC). */
export const CAPSULE_PAIR_SURFACE_GAP_M = 0.1;

export const NPC_STATE_DEAD = 2;

export type NpcArchetypeBodyDims = {
  radiusM: number;
  heightM: number;
};

export function playerBodyHeightM(crouch: boolean): number {
  return crouch ? PLAYER_BODY_HEIGHT_CROUCH_M : PLAYER_BODY_HEIGHT_STAND_M;
}

export function npcBodyDimsForArchetype(archetype: string): NpcArchetypeBodyDims {
  if (archetype === "babushka") {
    return { radiusM: BABUSHKA_BODY_RADIUS_M, heightM: BABUSHKA_BODY_HEIGHT_M };
  }
  return { radiusM: 0.25, heightM: 1.6 };
}

export function capsuleMinCenterDistanceM(
  radiusA: number,
  radiusB: number,
  gapM: number = CAPSULE_PAIR_SURFACE_GAP_M,
): number {
  return radiusA + radiusB + gapM;
}

export function babushkaMinPlayerCenterDistanceM(): number {
  return capsuleMinCenterDistanceM(BABUSHKA_BODY_RADIUS_M, PLAYER_BODY_RADIUS_M);
}

export function babushkaMinPeerCenterDistanceM(): number {
  return capsuleMinCenterDistanceM(BABUSHKA_BODY_RADIUS_M, BABUSHKA_BODY_RADIUS_M);
}

/** Feet-rooted vertical capsule overlap (matches `combat_stub::vertical_overlap`). */
export function verticalCapsuleOverlap(
  feetA: number,
  heightA: number,
  feetB: number,
  heightB: number,
): boolean {
  return feetA < feetB + heightB && feetB < feetA + heightA;
}

export function npcCapsuleCollisionAabb(args: {
  feetX: number;
  feetY: number;
  feetZ: number;
  radiusM: number;
  heightM: number;
}): { min: [number, number, number]; max: [number, number, number] } {
  const { feetX, feetY, feetZ, radiusM, heightM } = args;
  return {
    min: [feetX - radiusM, feetY, feetZ - radiusM],
    max: [feetX + radiusM, feetY + heightM, feetZ + radiusM],
  };
}

export function isLivingWorldNpc(state: number, health: number): boolean {
  return state !== NPC_STATE_DEAD && health > 0;
}

import type { NpcPerceptionProfile } from "../npcPerception.js";

/** Match authoritative `apps/server/src/npc.rs` babushka perception tuning. */
export const BABUSHKA_AGGRO_RANGE_M = 6.5;
export const BABUSHKA_VISION_HALF_ANGLE_DEG = 60;
export const BABUSHKA_VISION_HALF_ANGLE_RAD =
  (BABUSHKA_VISION_HALF_ANGLE_DEG * Math.PI) / 180;
export const BABUSHKA_CROUCH_DETECTION_RANGE_MUL = 0.55;

export const BABUSHKA_NPC_PERCEPTION: NpcPerceptionProfile = {
  aggroRangeM: BABUSHKA_AGGRO_RANGE_M,
  visionHalfAngleRad: BABUSHKA_VISION_HALF_ANGLE_RAD,
  crouchDetectionRangeMul: BABUSHKA_CROUCH_DETECTION_RANGE_MUL,
};

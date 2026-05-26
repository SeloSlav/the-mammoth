import type { NpcArchetypeId } from "./replicatedNpcSnapshot.js";
import { BABUSHKA_NPC_PERCEPTION } from "./archetypes/babushka.js";
import type { NpcPerceptionProfile } from "./npcPerception.js";

const DEFAULT_NPC_PERCEPTION: NpcPerceptionProfile = {
  aggroRangeM: 6.0,
  visionHalfAngleRad: (55 * Math.PI) / 180,
  crouchDetectionRangeMul: 0.6,
};

export function npcPerceptionForArchetype(
  archetype: NpcArchetypeId | string,
): NpcPerceptionProfile {
  if (archetype === "babushka") return BABUSHKA_NPC_PERCEPTION;
  return DEFAULT_NPC_PERCEPTION;
}

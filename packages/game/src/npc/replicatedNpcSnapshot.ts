import type { LocomotionPresentation } from "@the-mammoth/game";

export type NpcArchetypeId = "babushka";

export type NpcBodyClipName = "idle" | "walk" | "run" | "punch";

export type ReplicatedNpcSnapshot = {
  npcId: bigint;
  archetype: NpcArchetypeId;
  worldPosition: { x: number; y: number; z: number };
  yawRad: number;
  velocity: { x: number; y: number; z: number };
  grounded: boolean;
  locomotion: LocomotionPresentation;
  /** `world_npc.state` — 0 idle, 1 aggro, 2 dead. */
  state: number;
  health: number;
  maxHealth: number;
  meleePresentationSeq: number;
  hitPresentationSeq: number;
  observedTimeMs: number;
};

const NPC_LOCOMOTION_MIN_SPEED_SQ = 0.04;

export function resolveNpcBodyClipName(args: {
  grounded: boolean;
  locomotion: LocomotionPresentation;
  dead: boolean;
  velocity?: { x: number; z: number };
}): NpcBodyClipName {
  if (args.dead) return "idle";
  if (!args.grounded) return "idle";
  if (args.locomotion === "run") return "run";
  if (args.locomotion === "walk") return "walk";
  const speedSq =
    (args.velocity?.x ?? 0) * (args.velocity?.x ?? 0) +
    (args.velocity?.z ?? 0) * (args.velocity?.z ?? 0);
  if (speedSq >= NPC_LOCOMOTION_MIN_SPEED_SQ) return "walk";
  return "idle";
}

export function npcLocomotionFromServerByte(locomotion: number): LocomotionPresentation {
  if (locomotion === 2) return "run";
  if (locomotion === 1) return "walk";
  return "idle";
}

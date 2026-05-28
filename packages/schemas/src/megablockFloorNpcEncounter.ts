/**
 * Data-driven megablock floor NPC encounters — keep in sync with `apps/server/src/megablock_floor_npc.rs`.
 */

import {
  FIRST_EXTRACTION_FLOOR_DOC_ID,
  FIRST_EXTRACTION_LEVEL_INDEX,
  FIRST_EXTRACTION_MISSION_ID,
} from "./playerMissions.js";

/** Live-world `world_npc.session_key` prefix (`megablock:floor:{levelIndex}`). */
export const MEGABLOCK_FLOOR_SESSION_PREFIX = "megablock:floor:" as const;

export type MegablockFloorNpcEncounterDef = {
  /** Mission must be in progress (`offered`…`collected`) to keep this encounter live. */
  missionId: string;
  floorDocId: string;
  /** `mammoth.json` `levelIndex` (elevator deck + 1). */
  levelIndex: number;
  babushkaCount: number;
  /** Stable spawn layout salt (per-encounter, not per-NPC index). */
  spawnSalt: bigint;
};

export function megablockFloorSessionKey(levelIndex: number): string {
  return `${MEGABLOCK_FLOOR_SESSION_PREFIX}${levelIndex}`;
}

export function parseMegablockFloorSessionKey(
  sessionKey: string,
): number | null {
  if (!sessionKey.startsWith(MEGABLOCK_FLOOR_SESSION_PREFIX)) return null;
  const raw = sessionKey.slice(MEGABLOCK_FLOOR_SESSION_PREFIX.length);
  const level = Number.parseInt(raw, 10);
  return Number.isFinite(level) && level > 0 ? level : null;
}

/** First game loop — babushkas on extraction deck 16 only while the fuse wire work order is active. */
export const FIRST_EXTRACTION_FLOOR_NPC_ENCOUNTER: MegablockFloorNpcEncounterDef =
  {
    missionId: FIRST_EXTRACTION_MISSION_ID,
    floorDocId: FIRST_EXTRACTION_FLOOR_DOC_ID,
    levelIndex: FIRST_EXTRACTION_LEVEL_INDEX,
    babushkaCount: 6,
    spawnSalt: 0x16_f1_00_01n,
  };

/**
 * Player work orders / extraction missions — keep in sync with `apps/server/src/player_mission.rs`.
 */

/** Passenger elevator deck for the first extraction run. */
export const FIRST_EXTRACTION_ELEVATOR_DECK = 16 as const;

/** `mammoth.json` levelIndex — elevator deck + 1. */
export const FIRST_EXTRACTION_LEVEL_INDEX = FIRST_EXTRACTION_ELEVATOR_DECK + 1;

export const FIRST_EXTRACTION_FLOOR_DOC_ID = "floor_mamutica_typical" as const;

export const FIRST_EXTRACTION_UNIT_ID = "unit_e_004" as const;

/** Diegetic stencil / radio shorthand (`16-E-4`). */
export const FIRST_EXTRACTION_PUBLIC_LABEL = "16-E-4" as const;

export const FIRST_EXTRACTION_ITEM_DEF_ID = "fuse-wire-pack" as const;

export const FIRST_EXTRACTION_MISSION_ID = "work_order_fuse_wire_16e4" as const;

export const FIRST_EXTRACTION_DISPLAY_TITLE = "Fuse kit — unit 16-E-4" as const;

export const FIRST_EXTRACTION_ISSUER = "Rada (maintenance net)" as const;

/** Scrip granted when the first extraction turn-in completes. */
export const FIRST_EXTRACTION_SCRIP_REWARD = 15 as const;

export const SCRIP_ITEM_DEF_ID = "scrip" as const;

export function firstExtractionUnitKey(
  floorDocId: string = FIRST_EXTRACTION_FLOOR_DOC_ID,
): string {
  return `${floorDocId}|${FIRST_EXTRACTION_LEVEL_INDEX}|${FIRST_EXTRACTION_UNIT_ID}`;
}

/** Server `PlayerMissionProgress.status` — do not renumber without migration. */
export const MISSION_STATUS = {
  /** Offered on connect; transitions to active immediately for the first mission. */
  OFFERED: 0,
  ACTIVE: 1,
  /** Objective item picked up (inventory or hotbar). */
  COLLECTED: 2,
  /** Deposited in footlocker or passed out at home while carrying it. */
  COMPLETE: 3,
  FAILED: 4,
} as const;

export type MissionStatus = (typeof MISSION_STATUS)[keyof typeof MISSION_STATUS];

export type MissionObjectiveStep = {
  id: string;
  label: string;
  done: boolean;
};

export type MissionPanelEntry = {
  missionId: string;
  title: string;
  issuer: string;
  status: MissionStatus;
  itemCollected: boolean;
  itemDeposited: boolean;
  objectiveItemDefId: string;
  objectiveItemLabel: string;
  targetElevatorDeck: number;
  targetPublicLabel: string;
  steps: MissionObjectiveStep[];
};

export function missionStatusLabel(status: MissionStatus): string {
  switch (status) {
    case MISSION_STATUS.OFFERED:
      return "Offered";
    case MISSION_STATUS.ACTIVE:
      return "Active";
    case MISSION_STATUS.COLLECTED:
      return "Collected";
    case MISSION_STATUS.COMPLETE:
      return "Complete";
    case MISSION_STATUS.FAILED:
      return "Failed";
    default:
      return "Unknown";
  }
}

export function buildFirstExtractionMissionPanel(
  row: {
    activeMissionId: string;
    status: number;
    itemCollected: boolean;
    itemDeposited: boolean;
  } | null,
  itemDisplayName: string,
): MissionPanelEntry | null {
  if (!row || row.activeMissionId !== FIRST_EXTRACTION_MISSION_ID) return null;
  const status = row.status as MissionStatus;
  if (
    status !== MISSION_STATUS.OFFERED &&
    status !== MISSION_STATUS.ACTIVE &&
    status !== MISSION_STATUS.COLLECTED &&
    status !== MISSION_STATUS.COMPLETE &&
    status !== MISSION_STATUS.FAILED
  ) {
    return null;
  }

  const collected = row.itemCollected || status >= MISSION_STATUS.COLLECTED;
  const deposited = row.itemDeposited || status === MISSION_STATUS.COMPLETE;
  const collapseComplete =
    status === MISSION_STATUS.COMPLETE && collected && !row.itemDeposited;

  const steps: MissionObjectiveStep[] = [
    {
      id: "descend",
      label: `Go to ${FIRST_EXTRACTION_PUBLIC_LABEL}`,
      done: collected,
    },
    {
      id: "collect",
      label: `Retrieve ${itemDisplayName}`,
      done: collected,
    },
    {
      id: "deposit",
      label: "Stash item",
      done: deposited || collapseComplete,
    },
  ];

  return {
    missionId: FIRST_EXTRACTION_MISSION_ID,
    title: FIRST_EXTRACTION_DISPLAY_TITLE,
    issuer: FIRST_EXTRACTION_ISSUER,
    status,
    itemCollected: collected,
    itemDeposited: deposited,
    objectiveItemDefId: FIRST_EXTRACTION_ITEM_DEF_ID,
    objectiveItemLabel: itemDisplayName,
    targetElevatorDeck: FIRST_EXTRACTION_ELEVATOR_DECK,
    targetPublicLabel: FIRST_EXTRACTION_PUBLIC_LABEL,
    steps,
  };
}

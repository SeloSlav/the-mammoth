export const STAIR_WELL_EDITOR_PART_IDS = [
  "shaft_floor",
  "shaft_wall",
  "stair_flights",
  "stair_flight_lower",
  "stair_landing_lower",
  "stair_flight_upper",
  "stair_landing_upper",
] as const;

/** Editor-only gizmo target: move/resize the stair corridor opening. */
export const STAIR_WELL_OPENING_PROXY_ID = "stair_entry_opening_proxy" as const;
export const STAIR_WELL_SECONDARY_OPENING_PROXY_ID =
  "stair_entry_opening_proxy_secondary" as const;
export const STAIR_WELL_OPENING_PROXY_IDS = [
  STAIR_WELL_OPENING_PROXY_ID,
  STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
] as const;
export type StairWellOpeningProxyId = (typeof STAIR_WELL_OPENING_PROXY_IDS)[number];

export function isStairWellOpeningProxyId(
  value: string | null | undefined,
): value is StairWellOpeningProxyId {
  return value === STAIR_WELL_OPENING_PROXY_ID || value === STAIR_WELL_SECONDARY_OPENING_PROXY_ID;
}

export type StairWellEditorPartId = (typeof STAIR_WELL_EDITOR_PART_IDS)[number];
export type StairWellAuthoringScope = "typical" | "ground";

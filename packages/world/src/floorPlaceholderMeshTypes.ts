import type { StairCorridorSignPlacement } from "./stairwellCorridorSign.js";
import type { CardinalFace, WallHoleXY, WallHoleYZ } from "./wallWithDoorCutout.js";
import type { ShaftSlabHole } from "./shaftPlanformClip.js";

export type PlaceholderKind = "corridor" | "unit" | "core" | "misc";

/** Room-local holes on corridor perimeter walls (aligned with adjacent stair / elevator doors). */
export type CorridorShellWallHoles = {
  e: WallHoleYZ[];
  w: WallHoleYZ[];
  n: WallHoleXY[];
  s: WallHoleXY[];
};

/** Room-local data to place a sign above an elevator door on a corridor wall. */
export type ElevatorCorridorSignPlacement = {
  corridorWall: CardinalFace;
  /** Top of door opening (room-local Y). */
  yDoorTop: number;
  zMid: number;
  xMid: number;
};

export type HollowShellOpts = {
  shaftHolesPlate: readonly ShaftSlabHole[];
  roomPx: number;
  roomPz: number;
  /** When set (e.g. room has rotation), use solid floor/ceiling plates — cutouts are axis-only. */
  skipShaftCutouts: boolean;
  /** 1-based storey; level 1 gets lobby-style openings on corridor shells. */
  storyLevelIndex?: number;
  /** Optional authored compact floor label for landing signs, e.g. `PR`, `1`, `19`. */
  storyShortLabel?: string;
  /** Elevator-only union (plate-space); second cut on shell floor/ceiling so flanking plates do not cap hoistways. */
  shaftElevatorsMerged?: readonly ShaftSlabHole[];
  /** Cuts through corridor walls opposite elevator doors (room-local). */
  corridorWallHoles?: CorridorShellWallHoles;
  /** Elevator door heads on this corridor shell — room-local; used for manufacturer signage. */
  elevatorSignPlacements?: readonly ElevatorCorridorSignPlacement[];
  /** Stairwell door heads — room-local; cantilevered STEP signs above each cutout. */
  stairSignPlacements?: readonly StairCorridorSignPlacement[];
  /** Perimeter faces that sit on the building exterior and should receive facade cladding. */
  exteriorFaces?: readonly CardinalFace[];
  /** Unit exterior window openings (merged into inner walls; cladding uses these for units only). */
  exteriorWindowHoles?: CorridorShellWallHoles;
  /** Authoring PBR ceiling for ground-storey shells and corridors with apartment entry cuts. */
  useAuthoringCorridorCeiling?: boolean;
};

import type { CardinalFace } from "./wallWithDoorCutout.js";

export type PlateStairCorridorDoorPunch = {
  /** Door wall on the stair/elevator shaft (same convention as hoistway shell builder). */
  stairFace: CardinalFace;
  tangentLocal: number;
  doorHalfW: number;
  y0Local: number;
  y1Local: number;
  spx: number;
  spz: number;
  spy: number;
  shx: number;
  shz: number;
  /** When true, a manufacturer sign is placed on the adjacent corridor wall above this door. */
  isElevator?: boolean;
};

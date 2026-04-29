import { EXTERIOR_DOOR_W_M } from "./elevatorCollisionTuning.js";
import { STOREY_SPACING_M } from "./stairWellGeometry.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";

/** Hoistway + corridor punch clear width (m). Matches cab / landing `EXTERIOR_DOOR_W_M`. */
export const SHAFT_DOUBLE_DOOR_W = EXTERIOR_DOOR_W_M;

/** Exported for mega-shaft corridor door band spacing (m). */
export const SHAFT_DOUBLE_DOOR_H = 2.2;
/** Ground-level door cutout only reaches this high on mega stair shafts (m). */
export const SHAFT_GROUND_DOOR_BAND_M = STOREY_SPACING_M - 0.38;

export type ShaftGroundDoorOpts = {
  /**
   * Elevators: set explicitly. Stair wells: omit and provide `towardPlateXZ` + `shaftPlateXZ`
   * so a face is chosen away from circulating treads / corner landings.
   */
  face?: CardinalFace;
  /**
   * Vertical band from interior floor where a door opening may be cut (m).
   * Full-height shells use the whole wall; mega shafts use ~one storey.
   */
  bandHeightM: number;
  /** Plate-space XZ (e.g. floor centroid) for stair door tie-break / fallback. */
  towardPlateXZ?: readonly [number, number];
  /** Plate-space XZ of this shaft's column (stair auto door only). */
  shaftPlateXZ?: readonly [number, number];
  /**
   * Hole centre offset along wall tangent (+Z for E/W, +X for N/S). Stairs: set by auto placement.
   */
  tangentOffsetAlongWall?: number;
  /** Clear opening width in meters. */
  doorWidthM?: number;
  /**
   * When set (stair only), overrides sill-based vertical extent for the door cutout / frame
   * (shaft interior local Y, same frame as treads / landings).
   */
  doorHoleY0Local?: number;
  doorHoleY1Local?: number;
};

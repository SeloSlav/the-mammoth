import type { ApartmentDoorTemplate } from "./unitEntryAdjacency.js";
import { extendResidentialBoundsXZForBalcony } from "./residentialUnitBalcony.js";

/**
 * Depth into the playable interior from the apartment entry hinge along the primary axis —
 * **`derive_bounds` / `SwingDoorFace` W/E branches** (`apps/server/src/apartments.rs`).
 */
export const RESIDENTIAL_UNIT_PLAYABLE_DEPTH_M = 13;
/**
 * Half-span across the hinge tangent for W/E playable boxes — **`UNIT_HALF_WIDTH` / `HALF_WIDTH`**
 * pair in Rust `derive_bounds`.
 */
export const RESIDENTIAL_UNIT_PLAYABLE_HALF_WIDTH_M = 3.3;
/**
 * **`RESIDENTIAL_FAR_WALL_X_INSET_M`** in `derive_bounds`: pulls the far façade wall inward on the
 * long axis for east/west entries.
 */
export const RESIDENTIAL_FAR_WALL_X_INSET_M = 1.38;

export type ResidentialUnitStrictBoundsXZ = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/**
 * X/Z footprint of **`derive_bounds`** (ignores vertical Y extents that depend on storey level via
 * `feet_world_y`).
 */
export function residentialUnitStrictBoundsXZ(
  t: ApartmentDoorTemplate,
): ResidentialUnitStrictBoundsXZ {
  const { hingeX, hingeZ } = t;
  const HALF_WIDTH = RESIDENTIAL_UNIT_PLAYABLE_HALF_WIDTH_M;
  const DEPTH = RESIDENTIAL_UNIT_PLAYABLE_DEPTH_M;
  const FI = RESIDENTIAL_FAR_WALL_X_INSET_M;
  let bounds: ResidentialUnitStrictBoundsXZ;
  switch (t.face) {
    case "w":
      bounds = {
        minX: hingeX + 0.08,
        maxX: hingeX + DEPTH - FI,
        minZ: hingeZ - HALF_WIDTH,
        maxZ: hingeZ + HALF_WIDTH,
      };
      break;
    case "e":
      bounds = {
        minX: hingeX - DEPTH + FI,
        maxX: hingeX - 0.08,
        minZ: hingeZ - HALF_WIDTH,
        maxZ: hingeZ + HALF_WIDTH,
      };
      break;
    default:
      bounds = {
        minX: hingeX - HALF_WIDTH,
        maxX: hingeX + HALF_WIDTH,
        minZ: hingeZ - DEPTH,
        maxZ: hingeZ + HALF_WIDTH,
      };
      break;
  }
  return extendResidentialBoundsXZForBalcony(bounds, t.unitId);
}

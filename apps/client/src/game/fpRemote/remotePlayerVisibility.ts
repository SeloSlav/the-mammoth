import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "@the-mammoth/world";
import {
  fpCameraOrFeetInsideBuildingFootprintXZ,
  fpCameraOrFeetNearBuildingFootprintXZ,
} from "../fpFloor/fpBuildingFloorPlateVisibilityBand.js";

export const POSE_AOI_Y_HALF_M = DEFAULT_BUILDING_FLOOR_SPACING_M * 1.75;
export const POSE_AOI_RECENTER_Y_M = DEFAULT_BUILDING_FLOOR_SPACING_M * 0.75;
const REMOTE_PLAYER_RENDER_VERTICAL_DELTA_M = DEFAULT_BUILDING_FLOOR_SPACING_M * 1.6;

type XzBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function shouldRenderRemotePlayer(input: {
  localCameraX: number;
  localCameraZ: number;
  localFeetX: number;
  localFeetY: number;
  localFeetZ: number;
  remoteFeetX: number;
  remoteFeetY: number;
  remoteFeetZ: number;
  buildingBoundsXz: XzBounds;
}): boolean {
  const bounds = input.buildingBoundsXz;
  const localNearBuilding = fpCameraOrFeetNearBuildingFootprintXZ({
    cameraX: input.localCameraX,
    cameraZ: input.localCameraZ,
    feetX: input.localFeetX,
    feetZ: input.localFeetZ,
    boundsMinX: bounds.minX,
    boundsMaxX: bounds.maxX,
    boundsMinZ: bounds.minZ,
    boundsMaxZ: bounds.maxZ,
  });
  const remoteInsideBuilding = fpCameraOrFeetInsideBuildingFootprintXZ({
    cameraX: input.remoteFeetX,
    cameraZ: input.remoteFeetZ,
    feetX: input.remoteFeetX,
    feetZ: input.remoteFeetZ,
    boundsMinX: bounds.minX,
    boundsMaxX: bounds.maxX,
    boundsMinZ: bounds.minZ,
    boundsMaxZ: bounds.maxZ,
  });
  if (!localNearBuilding && remoteInsideBuilding) {
    return false;
  }

  const localInsideBuilding = fpCameraOrFeetInsideBuildingFootprintXZ({
    cameraX: input.localCameraX,
    cameraZ: input.localCameraZ,
    feetX: input.localFeetX,
    feetZ: input.localFeetZ,
    boundsMinX: bounds.minX,
    boundsMaxX: bounds.maxX,
    boundsMinZ: bounds.minZ,
    boundsMaxZ: bounds.maxZ,
  });
  if (localInsideBuilding && remoteInsideBuilding) {
    return Math.abs(input.remoteFeetY - input.localFeetY) <= REMOTE_PLAYER_RENDER_VERTICAL_DELTA_M;
  }

  return true;
}

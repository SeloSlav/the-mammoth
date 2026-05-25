/** Barrel: stair shafts, elevator placeholders, stair-well previews — see submodules for implementations. */

export {
  STAIR_WELL_CEILING_PROP_ID_PREFIX,
  STAIR_WELL_EDITOR_PART_IDS,
  STAIR_WELL_OPENING_PROXY_ID,
  STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
  STAIR_WELL_OPENING_PROXY_IDS,
  isStairWellCeilingPropEditorId,
  isStairWellOpeningProxyId,
  parseStairWellCeilingPropEditorId,
  stairWellCeilingPropEditorId,
  type StairWellAuthoringScope,
  type StairWellEditorPartId,
  type StairWellOpeningProxyId,
} from "./stairWellEditorIds.js";

export {
  SHAFT_DOUBLE_DOOR_H,
  SHAFT_DOUBLE_DOOR_W,
  SHAFT_GROUND_DOOR_BAND_M,
  type ShaftGroundDoorOpts,
} from "./stairElevatorShaftConstants.js";

export { stairShaftDoorTangentSpanShaftLocal } from "./stairShaftDoorGeometry.js";

export {
  addElevatorShaftPlaceholder,
  elevatorGroundDoorOpeningLocals,
  tagShaftShellMeshesSkipFloorGeometryMerge,
  type ElevatorShaftPlaceholderOpts,
} from "./elevatorShaftPlaceholder.js";

export {
  type ResolvedStairWellGroundDoor,
  type StairWellGroundDoorContext,
  resolveStairWellGroundDoor,
  resolveStairWellSupplementalDoors,
} from "./stairWellGroundDoorResolve.js";

export {
  addStairWellPlaceholder,
  applyStairWellPartTransforms,
  type StairWellPlaceholderOpts,
  type StairWellPreviewOpeningSpec,
} from "./stairWellPlaceholder.js";

export {
  buildStairWellPreviewRoot,
  rebuildStairWellPreviewOpening,
  rebuildStairWellPreviewRoot,
  stairWellEntryOpeningFromProxyMesh,
  type BuildStairWellPreviewRootArgs,
} from "./stairWellPreviewRoot.js";

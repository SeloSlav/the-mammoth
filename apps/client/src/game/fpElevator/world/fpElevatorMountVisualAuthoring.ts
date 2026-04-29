import {
  ElevatorCabDefSchema,
  LandingKitDefSchema,
} from "@the-mammoth/schemas";
import cabAuthoringJson from "../../../../../../content/elevator/cab.json";
import landingKitAuthoringJson from "../../../../../../content/elevator/landing_kit.json";
import { EXTERIOR_INTERACT_WORLD_RADIUS_M } from "../fpElevatorLandingExteriorDoor.js";
import type { ElevatorDoorFace } from "../fpElevatorLabels.js";

function parseElevatorVisualDefs():
  | { cabDef?: undefined; landingKitDef?: undefined }
  | {
      cabDef?: import("@the-mammoth/schemas").ElevatorCabDef;
      landingKitDef?: import("@the-mammoth/schemas").LandingKitDef;
    } {
  const cab = ElevatorCabDefSchema.safeParse(cabAuthoringJson);
  const kit = LandingKitDefSchema.safeParse(landingKitAuthoringJson);
  return {
    cabDef: cab.success ? cab.data : undefined,
    landingKitDef: kit.success ? kit.data : undefined,
  };
}

export const elevatorVisualAuthoring = parseElevatorVisualDefs();

export const EXTERIOR_INTERACT_SHAFT_CENTER_PAD_M =
  EXTERIOR_INTERACT_WORLD_RADIUS_M + 0.45;
export const LANDING_HAIL_PICK_SHAFT_CENTER_PAD_M = 9.0;

/**
 * Door openness required before the opening is visually wide enough to justify doorway-sightline
 * logic. It no longer forces a full-stack reveal from inside the cab; it only decides when the
 * doorway can count as a real view out for cab-occlusion / landing-visibility decisions.
 */
export const DOOR_OPEN_REVEAL_THRESHOLD = 0.16;

/** Horizontal look component toward the doorway required before we assume the camera can see out. */
const DOORWAY_VIEW_DIR_DOT_MIN = 0.2;

export function fpElevDoorwayViewFacingDoor(
  face: ElevatorDoorFace,
  viewDirX: number,
  viewDirZ: number,
): boolean {
  if (face === "e") return viewDirX > DOORWAY_VIEW_DIR_DOT_MIN;
  if (face === "w") return viewDirX < -DOORWAY_VIEW_DIR_DOT_MIN;
  if (face === "n") return viewDirZ > DOORWAY_VIEW_DIR_DOT_MIN;
  return viewDirZ < -DOORWAY_VIEW_DIR_DOT_MIN;
}

import {
  BuildingDocSchema,
  ElevatorCabDefSchema,
  LandingKitDefSchema,
  StairWellDefSchema,
} from "@the-mammoth/schemas";
import type { EditorContentIndex } from "../editor/content/editorContentDiscovery.js";

export const EMPTY_CONTENT_INDEX: EditorContentIndex = {
  buildingPath: "building/mammoth.json",
  floorDocIds: [],
  interiorDocIds: [],
  cellDocIds: [],
  prefabDefIds: [],
  floorOverrideDocIds: [],
  elevatorCabRelPath: "elevator/cab.json",
  landingKitRelPath: "elevator/landing_kit.json",
  apartmentKitRelPath: "door/apartment_unit_kit.json",
  stairWellRelPath: "elevator/stairwell.json",
  materialTextureUrls: [],
};

export const DEFAULT_ELEVATOR_CAB_DEF = ElevatorCabDefSchema.parse({
  id: "default_elevator_cab",
  version: 1,
});

export const DEFAULT_LANDING_KIT_DEF = LandingKitDefSchema.parse({
  id: "default_landing_kit",
  version: 1,
});

/** Mirrors on-disk apartment kit until bootstrap loads `content/door/apartment_unit_kit.json`. */
export const DEFAULT_APARTMENT_KIT_DEF = LandingKitDefSchema.parse({
  id: "default_apartment_unit_kit",
  version: 1,
  displayName: "Apartment unit door kit",
  solid: true,
  panelWidthM: 1.18,
  panelHeightM: 2.0,
});

export const DEFAULT_STAIR_WELL_DEF = StairWellDefSchema.parse({
  id: "default_stair_well",
  version: 1,
});

export const DEFAULT_BUILDING = BuildingDocSchema.parse({
  id: "mammoth_main",
  version: 1,
  floorRefs: [],
});

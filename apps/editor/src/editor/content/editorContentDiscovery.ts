export const EDITOR_PREFABS_DIR = "prefabs";
export const EDITOR_CELLS_DIR = "cells";
export const EDITOR_INTERIORS_DIR = "interiors";
export const EDITOR_BUILDING_DIR = "building";
export const EDITOR_FLOORS_DIR = "building/floors";
export const EDITOR_FLOOR_OVERRIDES_DIR = "building/floor-overrides";
export const EDITOR_BUILDING_FILE = "building/mammoth.json";
export const EDITOR_ELEVATOR_DIR = "elevator";
/** Shared-door kits other than the corridor elevator door (currently: apartment unit kit). */
export const EDITOR_DOOR_DIR = "door";
export const EDITOR_APARTMENT_KIT_FILE = "door/apartment_unit_kit.json";
/** Built-in bed / wardrobe / footlocker layout (normalized to unit hull in-game). */
export const EDITOR_OWNED_APT_BUILTINS_FILE = "apartment/owned_apartment_builtins.json";
export const EDITOR_COLLISION_STAMP_FILE = "building/.collision-artifacts-stamp.json";

export type EditorContentIndex = {
  buildingPath: string;
  floorDocIds: string[];
  interiorDocIds: string[];
  cellDocIds: string[];
  prefabDefIds: string[];
  floorOverrideDocIds: string[];
  /** Repo-relative JSON paths under `content/` for shared elevator visuals. */
  elevatorCabRelPath: string;
  landingKitRelPath: string;
  /** Repo-relative JSON path to the apartment-unit door kit (shares `LandingKitDef`). */
  apartmentKitRelPath: string;
  stairWellRelPath: string;
  /** URLs under `apps/client/public/static/materials/**` that can be used directly as `mapUrl`. */
  materialTextureUrls: string[];
};

export type CollisionArtifactsStatus = {
  sourceFingerprint: string;
  builtFingerprint: string | null;
  stale: boolean;
  stampPath: string;
  generatedFiles: string[];
};

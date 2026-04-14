export const EDITOR_PREFABS_DIR = "prefabs";
export const EDITOR_CELLS_DIR = "cells";
export const EDITOR_INTERIORS_DIR = "interiors";
export const EDITOR_BUILDING_DIR = "building";
export const EDITOR_FLOORS_DIR = "building/floors";
export const EDITOR_FLOOR_OVERRIDES_DIR = "building/floor-overrides";
export const EDITOR_BUILDING_FILE = "building/mammoth.json";
export const EDITOR_ELEVATOR_DIR = "elevator";
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
};

export type CollisionArtifactsStatus = {
  sourceFingerprint: string;
  builtFingerprint: string | null;
  stale: boolean;
  stampPath: string;
  generatedFiles: string[];
};

import type * as THREE from "three";
import { isApartmentFishTankModelRelPath } from "@the-mammoth/schemas";
import {
  APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH,
  createApartmentFishTankFishSchool,
  type FishTankFishSwimUpdater,
} from "./apartmentFishTankFishVisual.js";

export { APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH };

/** Normalize decor model paths to repo-relative `static/models/...` form. */
export function normalizeApartmentFishTankModelRelPath(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/u, "").replaceAll("\\", "/");
  if (trimmed.startsWith("static/models/")) return trimmed;
  if (trimmed.startsWith("objects/")) return `static/models/${trimmed}`;
  return `static/models/objects/${trimmed}`;
}

/** Implicit GLB paths required when placed items include a main fish tank. */
export function apartmentFishTankDecorTemplateDeps(
  placedModelRelPaths: readonly string[],
): string[] {
  const needsFish =
    placedModelRelPaths.some((p) =>
      isApartmentFishTankModelRelPath(normalizeApartmentFishTankModelRelPath(p)),
    );
  return needsFish ? [APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH] : [];
}

export type MountApartmentFishTankSchoolOptions = {
  tankModelRelPath: string;
  tankVisualRoot: THREE.Object3D;
  stableKey: string;
  fishTemplateRoot?: THREE.Object3D | null;
  decorateSwimmerMesh?: (mesh: THREE.Mesh) => void;
};

/** Mount six procedural swimmers when `tankModelRelPath` is the main fish tank GLB. */
export function mountApartmentFishTankSchool(
  opts: MountApartmentFishTankSchoolOptions,
): FishTankFishSwimUpdater | null {
  const norm = normalizeApartmentFishTankModelRelPath(opts.tankModelRelPath);
  if (!isApartmentFishTankModelRelPath(norm)) return null;

  return createApartmentFishTankFishSchool(opts.tankVisualRoot, opts.stableKey, {
    fishTemplateRoot: opts.fishTemplateRoot,
    decorateSwimmerMesh: opts.decorateSwimmerMesh,
  });
}

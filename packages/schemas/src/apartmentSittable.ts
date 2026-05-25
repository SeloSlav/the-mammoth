import {
  OWNED_APARTMENT_MODEL_BED,
  type OwnedApartmentPlacedItemKind,
} from "./ownedApartmentBuiltins.js";

/** How the player uses the furniture after pressing E. */
export type ApartmentSittableMode = "sit" | "lie";

export type ApartmentSittableLocalOffset = {
  x: number;
  y: number;
  z: number;
};

/** Face opposite decor local +Z (GLB forward vs gameplay forward). */
export const APARTMENT_SITTABLE_BODY_YAW_OFFSET_RAD = Math.PI;

export type ApartmentSittableSpec = {
  modelRelPath: string;
  mode: ApartmentSittableMode;
  /**
   * Seat anchor in decor root space; local +Z is the seat forward axis.
   * At runtime, X/Z are taken from the prop bounding-box center; `y` is height above bbox min Y.
   */
  localSeatOffset: ApartmentSittableLocalOffset;
  /** Added to world forward yaw derived from local +Z. */
  bodyYawOffsetRad: number;
  /** Eye height above feet while seated/lying (m). */
  eyeHeightM: number;
  /** Horizontal interact cylinder radius from seat anchor (m). */
  interactRadiusM: number;
  /** HUD verb, e.g. "Sit" or "Lie down". */
  promptLabel: string;
  /** Pitch applied on enter (rad); lie uses ceiling look. */
  defaultPitchRad: number;
  /**
   * Seats along decor local +X (sofa width). `1` = single center seat (chairs, bed, toilet).
   */
  lateralSeatCount?: number;
};

const CHAIR_SPEC: ApartmentSittableSpec = {
  modelRelPath: "static/models/objects/chair.glb",
  mode: "sit",
  /** Height above mesh floor (bbox min Y); XZ come from bbox center at runtime. */
  localSeatOffset: { x: 0, y: 0.52, z: 0 },
  bodyYawOffsetRad: APARTMENT_SITTABLE_BODY_YAW_OFFSET_RAD,
  /** Above seat anchor; 0.52 + 0.50 ≈ 1.02 m absolute eye (matches FP crouch). */
  eyeHeightM: 0.82,
  interactRadiusM: 1.35,
  promptLabel: "Sit",
  defaultPitchRad: 0,
};

const SOFA_SPEC: ApartmentSittableSpec = {
  modelRelPath: "static/models/objects/sofa.glb",
  mode: "sit",
  localSeatOffset: { x: 0, y: 0.38, z: 0 },
  bodyYawOffsetRad: APARTMENT_SITTABLE_BODY_YAW_OFFSET_RAD,
  /** Above seat anchor; 0.38 + 0.62 ≈ 1.0 m absolute eye (matches FP crouch). */
  eyeHeightM: 0.62,
  interactRadiusM: 1.2,
  promptLabel: "Sit",
  defaultPitchRad: 0,
  lateralSeatCount: 3,
};

const TOILET_SPEC: ApartmentSittableSpec = {
  modelRelPath: "static/models/objects/toilet.glb",
  mode: "sit",
  localSeatOffset: { x: 0, y: 0.48, z: 0 },
  bodyYawOffsetRad: APARTMENT_SITTABLE_BODY_YAW_OFFSET_RAD,
  eyeHeightM: 1.08,
  interactRadiusM: 1.1,
  promptLabel: "Sit",
  defaultPitchRad: 0,
};

const BED_SPEC: ApartmentSittableSpec = {
  modelRelPath: OWNED_APARTMENT_MODEL_BED,
  mode: "lie",
  localSeatOffset: { x: 0, y: 0.5, z: 0 },
  bodyYawOffsetRad: APARTMENT_SITTABLE_BODY_YAW_OFFSET_RAD,
  eyeHeightM: 0.42,
  interactRadiusM: 1.05,
  promptLabel: "Lie down",
  defaultPitchRad: 1.45,
};

const BY_MODEL_PATH = new Map<string, ApartmentSittableSpec>([
  [CHAIR_SPEC.modelRelPath, CHAIR_SPEC],
  [SOFA_SPEC.modelRelPath, SOFA_SPEC],
  [TOILET_SPEC.modelRelPath, TOILET_SPEC],
  [BED_SPEC.modelRelPath, BED_SPEC],
]);

/** Normalize editor / content paths to canonical `static/models/...` keys. */
export function normalizeApartmentSittableModelRelPath(path: string): string | null {
  const trimmed = path.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("static/models/")) return trimmed;
  if (trimmed.startsWith("objects/")) return `static/models/${trimmed}`;
  if (trimmed.startsWith("models/objects/")) return `static/${trimmed}`;
  return null;
}

export function apartmentSittableSpecFromModelPath(
  modelRelPath: string,
): ApartmentSittableSpec | null {
  const norm = normalizeApartmentSittableModelRelPath(modelRelPath);
  if (!norm) return null;
  return BY_MODEL_PATH.get(norm) ?? null;
}

export function ownedApartmentPlacedItemKindIsSittable(
  kind: OwnedApartmentPlacedItemKind,
): boolean {
  return kind === "bed";
}

export function apartmentSittableSpecForPlacedItem(args: {
  modelRelPath: string;
  itemKind: OwnedApartmentPlacedItemKind;
}): ApartmentSittableSpec | null {
  if (ownedApartmentPlacedItemKindIsSittable(args.itemKind)) {
    return BED_SPEC;
  }
  return apartmentSittableSpecFromModelPath(args.modelRelPath);
}

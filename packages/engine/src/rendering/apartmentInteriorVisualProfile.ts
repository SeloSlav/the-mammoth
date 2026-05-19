import * as THREE from "three";

/**
 * Single source of truth for abandoned-apartment interior look — shared by FP session,
 * apartment decor runtime, and editor apartment layout preview.
 */
export const APARTMENT_INTERIOR_VISUAL_PROFILE = {
  exposure: {
    exterior: 0.82,
    /** Dark base — mood comes from window/lamp pools, not a flat global wash. */
    interior: 0.62,
  },
  /**
   * Target for the shared scene rig while the camera is inside a unit. Intensities are zero so
   * only practical spots/points (windows, chandeliers, ceiling fixtures, TV) illuminate the flat.
   */
  interiorAmbient: {
    hemiSky: 0xe3e7df,
    hemiGround: 0xb8bcae,
    hemiIntensity: 0,
    fill: 0xdce1d8,
    fillIntensity: 0,
    dir: 0xf0efd9,
    dirIntensity: 0,
  },
  /**
   * Layer-scoped fill for residential shells + decor (FP `residentialInterior*` rig). Keeps
   * practical pools as the hero while preventing pitch-black floors and unshaded props.
   */
  interiorBounce: {
    hemiSky: 0xd4dbd2,
    hemiGround: 0x3a3632,
    hemiIntensity: 0.16,
    fill: 0xb8b5ae,
    fillIntensity: 0.075,
  },
  /** Shell plaster / parquet tints so props sit in the same palette as walls. */
  shell: {
    wallCeilColor: new THREE.Color(0.9, 0.88, 0.84),
    floorColor: new THREE.Color(0.82, 0.78, 0.72),
  },
  decor: {
    albedoMood: new THREE.Color(0.88, 0.86, 0.82),
    basicAlbedoMood: new THREE.Color(0.84, 0.82, 0.78),
    /** Clamp normalized albedo luminance into this band after mood multiply. */
    albedoLuminanceMin: 0.14,
    albedoLuminanceMax: 0.62,
    dielectricRoughnessMin: 0.48,
    metallicRoughnessMin: 0.28,
    emissiveScale: 0.55,
    fixtureEmissiveScale: 1.35,
  },
  practical: {
    window: {
      color: 0xd8e8f8,
      intensity: 3.1,
      distance: 7.5,
      decay: 2.2,
      angle: Math.PI / 3.4,
      penumbra: 0.38,
    },
    chandelier: {
      color: 0xffe8c8,
      intensity: 3.2,
      distance: 4.8,
      decay: 2.2,
    },
    ceiling: {
      color: 0xfff0dc,
      intensity: 2.15,
      distance: 3.1,
      decay: 2.2,
    },
    /** Floor lamp — local pool at seating height, shorter reach than ceiling fixtures. */
    standing: {
      color: 0xffe8c8,
      intensity: 2.35,
      distance: 3.4,
      decay: 2.2,
    },
    /** Horizontal wash from a powered-on TV — tight falloff so it does not flood the unit. */
    tv: {
      color: 0x6fa8ff,
      intensity: 4.2,
      distance: 12,
      decay: 2.2,
      angle: Math.PI / 2.35,
      penumbra: 0.55,
    },
  },
  contactShadow: {
    opacity: 0.2,
    radiusScale: 0.42,
    minRadiusM: 0.18,
    maxRadiusM: 1.35,
  },
  /** Hard cap — each window spot is expensive; never scan an entire tower unchecked. */
  maxWindowPracticalLightsPerUnit: 6,
} as const;

export type ApartmentUnitWorldBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type ApartmentDecorEmitterKind =
  | "chandelier"
  | "ceiling"
  | "standing"
  | "tv";

export function apartmentDecorEmitterKindFromModelPath(
  modelRelPath: string,
): ApartmentDecorEmitterKind | null {
  const lower = modelRelPath.toLowerCase().replace(/\\/gu, "/");
  if (lower.includes("chandelier")) return "chandelier";
  if (lower.includes("light-ceiling")) return "ceiling";
  if (lower.includes("lamp-standing")) return "standing";
  if (lower.endsWith("/tv.glb") || lower.includes("/objects/tv.glb")) return "tv";
  return null;
}

export function apartmentDecorWarmLightFixtureKind(
  modelRelPath: string,
): "chandelier" | "ceiling" | "standing" | null {
  const kind = apartmentDecorEmitterKindFromModelPath(modelRelPath);
  return kind === "chandelier" || kind === "ceiling" || kind === "standing"
    ? kind
    : null;
}

export function apartmentDecorContactShadowEligible(modelRelPath: string): boolean {
  const lower = modelRelPath.toLowerCase().replace(/\\/gu, "/");
  if (apartmentDecorEmitterKindFromModelPath(modelRelPath)) return false;
  if (lower.includes("rug")) return false;
  if (lower.includes("light-")) return false;
  return true;
}

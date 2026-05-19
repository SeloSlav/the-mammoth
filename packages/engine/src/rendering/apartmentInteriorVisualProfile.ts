import * as THREE from "three";

/**
 * Single source of truth for abandoned-apartment interior look — shared by FP session,
 * apartment decor runtime, and editor apartment layout preview.
 */
export const APARTMENT_INTERIOR_VISUAL_PROFILE = {
  exposure: {
    exterior: 0.82,
    /** Full interior adaptation — practical lights carry local pools; keep readable base. */
    interior: 0.68,
  },
  /** Global key/fill when the camera is inside a residential unit (before stairwell scale). */
  interiorAmbient: {
    hemiSky: 0xe3e7df,
    hemiGround: 0xb8bcae,
    /** Softer than the old 0.14 crush — practical lights add mood pools on top. */
    hemiIntensity: 0.42,
    fill: 0xdce1d8,
    fillIntensity: 0.11,
    dir: 0xf0efd9,
    dirIntensity: 0.22,
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
    dielectricRoughnessMin: 0.58,
    metallicRoughnessMin: 0.28,
    emissiveScale: 0.55,
    fixtureEmissiveScale: 1.35,
  },
  practical: {
    window: {
      color: 0xd8e8f8,
      intensity: 2.4,
      distance: 11,
      decay: 2,
      angle: Math.PI / 2.8,
      penumbra: 0.42,
    },
    chandelier: {
      color: 0xffe8c8,
      intensity: 2.8,
      distance: 6.5,
      decay: 2,
    },
    ceiling: {
      color: 0xfff0dc,
      intensity: 1.75,
      distance: 4.2,
      decay: 2,
    },
    /** Wide horizontal wash from a powered-on TV screen into the room. */
    tv: {
      color: 0x6fa8ff,
      intensity: 1.85,
      distance: 5.5,
      decay: 2,
      angle: Math.PI / 2.15,
      penumbra: 0.58,
    },
  },
  contactShadow: {
    opacity: 0.2,
    radiusScale: 0.42,
    minRadiusM: 0.18,
    maxRadiusM: 1.35,
  },
} as const;

export type ApartmentDecorEmitterKind = "chandelier" | "ceiling" | "tv";

export function apartmentDecorEmitterKindFromModelPath(
  modelRelPath: string,
): ApartmentDecorEmitterKind | null {
  const lower = modelRelPath.toLowerCase().replace(/\\/gu, "/");
  if (lower.includes("chandelier")) return "chandelier";
  if (lower.includes("light-ceiling")) return "ceiling";
  if (lower.endsWith("/tv.glb") || lower.includes("/objects/tv.glb")) return "tv";
  return null;
}

export function apartmentDecorWarmLightFixtureKind(
  modelRelPath: string,
): "chandelier" | "ceiling" | null {
  const kind = apartmentDecorEmitterKindFromModelPath(modelRelPath);
  return kind === "chandelier" || kind === "ceiling" ? kind : null;
}

export function apartmentDecorContactShadowEligible(modelRelPath: string): boolean {
  const lower = modelRelPath.toLowerCase().replace(/\\/gu, "/");
  if (apartmentDecorEmitterKindFromModelPath(modelRelPath)) return false;
  if (lower.includes("rug")) return false;
  if (lower.includes("light-")) return false;
  return true;
}

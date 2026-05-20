import * as THREE from "three";



/**

 * Single source of truth for abandoned-apartment interior look — shared by FP session,

 * apartment decor runtime, and editor apartment layout preview.

 */

export const APARTMENT_INTERIOR_VISUAL_PROFILE = {

  exposure: {

    exterior: 0.82,

    /** Dark interior ACES exposure — practicals/windows provide readable pools. */
    interior: 0.4,

  },

  /**

   * World / corridor rig before the flat blend completes. Fades to

   * {@link interiorAmbient} inside units; {@link interiorBounce} carries flat fill on layers 0/3/5.

   */

  exteriorRig: {

    hemiSky: 0xe3e7df,

    hemiGround: 0xb8bcae,

    hemiIntensity: 0.72,

    fill: 0xdce1d8,

    fillIntensity: 0.17,

    dir: 0xf0efd9,

    dirIntensity: 0.58,

  },

  /**

   * Layer-0 rig target while inside a unit — fades to zero so corridor sun does not wash the flat.

   */

  interiorAmbient: {

    hemiSky: 0xe3e7df,

    hemiGround: 0xe3e7df,

    hemiIntensity: 0,

    fill: 0xe8ebe6,

    fillIntensity: 0,

    dir: 0xf0efe8,

    dirIntensity: 0,

  },

  /**

   * Interior global fill (hemi + ambient + soft dir) on layers 0/3/5. **`hemiGround` must match

   * `hemiSky`** — a darker/warmer ground color tints vertical walls muddy brown.

   */

  interiorBounce: {

    hemiSky: 0xd6dad2,

    hemiGround: 0xd6dad2,

    /** Minimal flat fill — practical spots + normal response carry the read. */
    hemiIntensity: 0.06,

    fill: 0xd2d6ce,

    fillIntensity: 0.022,

    dir: 0xe6e2da,

    dirIntensity: 0.015,

  },

  scene: {

    /** Dark void behind the flat — editor layout + FP interior. */

    background: 0x121110,

    /** Reach full interior exposure/fill earlier in the doorway blend (FP). Editor passes `1`. */

    doorwayBlendExponent: 0.72,

    atmosphereActiveThreshold: 0.02,

    /** While in apartment preview / FP flat — `scene.environment` stays null; per-mesh PMREM only. */

    environmentIntensity: 1,

  },

  shell: {

    wallCeilColor: new THREE.Color(0.74, 0.72, 0.68),

    floorColor: new THREE.Color(0.66, 0.61, 0.55),

    /** PMREM on shells reads as ambient — keep low so spots carve form. */
    indirectEnvIntensity: 0.09,

    /** Boost tangent detail so lamps/windows rake plaster and parquet. */
    wallCeilNormalScale: 1.14,

    floorNormalScale: 1.26,

  },

  decor: {

    albedoMood: new THREE.Color(0.82, 0.8, 0.76),

    basicAlbedoMood: new THREE.Color(0.78, 0.76, 0.72),

    albedoLuminanceMin: 0.1,

    albedoLuminanceMax: 0.46,

    dielectricRoughnessMin: 0.48,

    metallicRoughnessMin: 0.28,

    indirectEnvIntensity: 0.09,

    /** Props with authored normals catch practical raking light. */
    normalScale: 1.12,

    emissiveScale: 0.55,

    fixtureEmissiveScale: 1.18,

  },

  practicalDecay: 1.85,

  practical: {

    window: {

      color: 0xc8dcf0,

      intensity: 4.15,

      distance: 9,

      angle: Math.PI / 3.2,

      penumbra: 0.44,

    },

    chandelier: {

      color: 0xffe8c8,

      intensity: 4.35,

      distance: 5.2,

    },

    ceiling: {

      color: 0xfff0dc,

      intensity: 3.05,

      distance: 3.6,

      angle: Math.PI / 2.35,

      penumbra: 0.52,

    },

    standing: {

      color: 0xfff0d4,

      /** Open-top shade — omni point at bulb center (down + up + sideways). */
      intensity: 5.85,

      distance: 4.6,

      decay: 1.45,

    },

    tv: {

      color: 0x6fa8ff,

      intensity: 3.75,

      distance: 10.5,

      angle: Math.PI / 2.35,

      penumbra: 0.58,

    },

    /** Monitor glow — same blue wash as TV, tighter pool for desk scale. */
    computer: {

      color: 0x6fa8ff,

      intensity: 3.5,

      distance: 8.5,

      angle: Math.PI / 2.4,

      penumbra: 0.55,

    },

  },

  contactShadow: {

    /** Off in editor until batched — legacy path leaked one mesh per drag and tanked FPS. */
    enabled: false,

    opacity: 0.2,

    radiusScale: 0.42,

    minRadiusM: 0.18,

    maxRadiusM: 1.35,

  },

  maxWindowPracticalLightsPerUnit: 6,

} as const;



/** @deprecated Use {@link APARTMENT_INTERIOR_VISUAL_PROFILE.scene.background}. */

export const APARTMENT_INTERIOR_PREVIEW_BACKGROUND =

  APARTMENT_INTERIOR_VISUAL_PROFILE.scene.background;



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

  | "tv"

  | "computer";



export function apartmentDecorEmitterKindFromModelPath(

  modelRelPath: string,

): ApartmentDecorEmitterKind | null {

  const lower = modelRelPath.toLowerCase().replace(/\\/gu, "/");

  if (lower.includes("chandelier")) return "chandelier";

  if (lower.includes("light-ceiling")) return "ceiling";

  if (lower.includes("lamp-standing")) return "standing";

  if (lower.endsWith("/tv.glb") || lower.includes("/objects/tv.glb")) return "tv";

  if (lower.endsWith("/computer.glb") || lower.includes("/objects/computer.glb")) {
    return "computer";
  }

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



/** Remap raw doorway proximity into the lighting blend factor (0 = exterior, 1 = full flat). */

export function mammothApartmentInteriorBlend01(interiorProximity01: number): number {

  const raw = THREE.MathUtils.clamp(interiorProximity01, 0, 1);

  return Math.pow(raw, APARTMENT_INTERIOR_VISUAL_PROFILE.scene.doorwayBlendExponent);

}



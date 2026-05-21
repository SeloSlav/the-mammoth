import * as THREE from "three";



/**

 * Single source of truth for abandoned-apartment interior look — shared by FP session,

 * apartment decor runtime, and editor apartment layout preview.

 */

export const APARTMENT_INTERIOR_VISUAL_PROFILE = {

  exposure: {

    exterior: 0.82,

    /** Dark interior ACES exposure — practicals/windows provide readable pools. */
    interior: 0.39,

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

    hemiSky: 0xdccab0,

    hemiGround: 0xdccab0,

    /** Minimal flat fill — practical spots + normal response carry the read. */
    hemiIntensity: 0.058,

    fill: 0xd7b98f,

    fillIntensity: 0.026,

    dir: 0xffd08a,

    dirIntensity: 0.014,

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

    /** Keep plaster close to authored color; lighting/post should grade it, not the material tint. */
    wallCeilColor: new THREE.Color(0.92, 0.89, 0.83),

    floorColor: new THREE.Color(0.7, 0.6, 0.47),

    /** PMREM on shells reads as ambient — keep low so spots carve form. */
    indirectEnvIntensity: 0.06,

    /** Boost tangent detail so lamps/windows rake plaster and parquet. */
    wallCeilNormalScale: 1.14,

    floorNormalScale: 1.26,

  },

  decor: {

    albedoMood: new THREE.Color(0.84, 0.76, 0.66),

    basicAlbedoMood: new THREE.Color(0.82, 0.73, 0.62),

    albedoLuminanceMin: 0.07,

    albedoLuminanceMax: 0.45,

    dielectricRoughnessMin: 0.48,

    metallicRoughnessMin: 0.28,

    indirectEnvIntensity: 0.055,

    /** Props with authored normals catch practical raking light. */
    normalScale: 1.12,

    emissiveScale: 0.55,

    fixtureEmissiveScale: 0.94,

  },

  practicalDecay: 1.85,

  practical: {

    window: {

      color: 0xe4bd8c,

      intensity: 2.35,

      distance: 7.5,

      angle: Math.PI / 3.2,

      penumbra: 0.44,

    },

    chandelier: {

      color: 0xffca84,

      /** Wide omni wash — soft falloff so corners stay amber-lit, not void-black. */
      intensity: 7.2,

      distance: 8.5,

      decay: 1.22,

    },

    ceiling: {

      color: 0xffca86,

      /** Down cone — brighter core, wide angle + soft penumbra for floor pool. */
      intensity: 5.4,

      distance: 6.8,

      angle: Math.PI / 1.88,

      penumbra: 0.78,

      decay: 1.25,

      /** Secondary omni at the fixture — fills wall/ceiling shadows away from the spot cone. */
      washIntensity: 2.35,

      washDistance: 9.5,

      washDecay: 1.08,

    },

    standing: {

      color: 0xffc783,

      /** Open-top shade — omni point at bulb center (down + up + sideways). */
      intensity: 3.05,

      distance: 3.55,

      decay: 1.55,

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

    /** Disabled — use {@link decorShadow} silhouette shadows only (no flat circle blobs). */
    enabled: false,

    opacity: 0.4,

    radiusScale: 0.46,

    minRadiusM: 0.2,

    maxRadiusM: 1.45,

  },

  /** Downward shadow map + silhouette bake for static decor on shell floors. */
  decorShadow: {

    enabled: true,

    /** Mesh-accurate top-down silhouette overlay (primary visible grounding). */
    bakedFloorOverlay: true,

    bakedMapSize: 1024,

    /** Alpha of warm floor-shadow overlay (normal blend — subtle, not pitch black). */
    bakedFloorOpacity: 0.3,

    /** Total opacity distributed over expanded penumbra rings. */
    bakedFloorSoftOpacity: 0.2,

    /** World-space outward expansion of the outermost penumbra mesh. */
    bakedFloorSoftRadiusM: 0.2,

    /** More rings make the geometry penumbra read less like a second hard edge. */
    bakedFloorSoftRings: 5,

    /** Warm brown shadow tint (not pure black). */
    bakedFloorShadowTint: 0x1f1b17,

    bakedFloorOffsetM: 0.004,

    /** Optional realtime shadow map (subtle; washed out by practicals without the bake). */
    realtimeShadowMap: false,

    mapSize: 1024,

    lightColor: 0xffe0b8,

    /** Small warm top fill — mainly carries the shadow term on floor shells. */
    lightIntensity: 0.11,

    bias: -0.0006,

    normalBias: 0.016,

    radius: 1.35,

    cameraPaddingM: 0.65,

    cameraHeightM: 5.5,

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

  if (lower.includes("wall-clock")) return false;

  if (lower.includes("painting")) return false;

  if (lower.includes("coat-hanger")) return false;

  return true;

}



/** Remap raw doorway proximity into the lighting blend factor (0 = exterior, 1 = full flat). */

export function mammothApartmentInteriorBlend01(interiorProximity01: number): number {

  const raw = THREE.MathUtils.clamp(interiorProximity01, 0, 1);

  return Math.pow(raw, APARTMENT_INTERIOR_VISUAL_PROFILE.scene.doorwayBlendExponent);

}



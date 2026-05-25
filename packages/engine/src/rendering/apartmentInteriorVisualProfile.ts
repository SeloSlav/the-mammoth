import * as THREE from "three";



/**

 * Single source of truth for abandoned-apartment interior look — shared by FP session,

 * apartment decor runtime, and editor apartment layout preview.

 */

export const APARTMENT_INTERIOR_VISUAL_PROFILE = {

  exposure: {

    exterior: 0.82,

    /** Moody interior ACES exposure — warm bounce keeps plaster readable without washing the flat. */
    interior: 0.36,

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

    hemiSky: 0xe8d8c0,

    hemiGround: 0xe8d8c0,

    /** Warm amber wash — present in shadows, but low enough that practicals still shape the room. */
    hemiIntensity: 0.055,

    fill: 0xe0c49a,

    fillIntensity: 0.022,

    dir: 0xffddb0,

    dirIntensity: 0.012,

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

    /** Warm shell PMREM — subtle lift in shadow; keep low so practicals carve form. */
    indirectEnvIntensity: 0.058,

    /** Shadow floor on wall/ceiling — tiny; prevents ACES blue crush without flattening the room. */
    wallCeilEmissive: new THREE.Color(1, 0.92, 0.78),

    wallCeilEmissiveIntensity: 0.022,

    /** Boost tangent detail so lamps/windows rake plaster and parquet. */
    wallCeilNormalScale: 1.14,

    floorNormalScale: 1.26,

  },

  decor: {

    albedoMood: new THREE.Color(0.84, 0.76, 0.66),

    basicAlbedoMood: new THREE.Color(0.82, 0.73, 0.62),

    albedoLuminanceMin: 0.07,

    albedoLuminanceMax: 0.46,

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

      /** Hero pool over dining — brighter core, faster falloff so the foreground can stay moody. */
      intensity: 4.55,

      distance: 6.25,

      decay: 1.55,

    },

    ceiling: {

      color: 0xffca86,

      intensity: 3.25,

      distance: 4.9,

      angle: Math.PI / 1.88,

      penumbra: 0.78,

      decay: 1.48,

      /** Low omni wash — corners only, not a second sun. */
      washIntensity: 1.05,

      washDistance: 6.4,

      washDecay: 1.32,

    },

    standing: {

      color: 0xffc783,

      /** Hot local lamp pool — shade reads bright, but falloff preserves foreground occlusion. */
      intensity: 3.75,

      distance: 3.75,

      decay: 1.72,

    },

    tv: {

      color: 0x6fa8ff,

      intensity: 2.6,

      distance: 10.5,

      angle: Math.PI / 2.35,

      penumbra: 0.58,

    },

    /** Monitor glow — same blue wash as TV, tighter pool for desk scale. */
    computer: {

      color: 0x6fa8ff,

      intensity: 2.45,

      distance: 8.5,

      angle: Math.PI / 2.4,

      penumbra: 0.55,

    },

    /** Hanging LED panel — cool white task pool over grow trays. */
    growOp: {

      color: 0xf2f7ff,

      intensity: 4.85,

      distance: 5.8,

      angle: Math.PI / 2.05,

      penumbra: 0.68,

      decay: 1.28,

      /** Soft under-tray fill without washing the whole flat. */
      washIntensity: 0.72,

      washDistance: 4.2,

      washDecay: 1.22,

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
    bakedFloorOpacity: 0.4,

    /** Total opacity distributed over expanded penumbra rings. */
    bakedFloorSoftOpacity: 0.28,

    /** World-space outward expansion of the outermost penumbra mesh. */
    bakedFloorSoftRadiusM: 0.24,

    /** More rings make the geometry penumbra read less like a second hard edge. */
    bakedFloorSoftRings: 5,

    /** Warm brown shadow tint (not pure black). */
    bakedFloorShadowTint: 0x17130f,

    /** Keep overlays visibly above receiver surfaces at close camera ranges. */
    bakedFloorOffsetM: 0.012,

    /** Tiny outward spread on the core silhouette so contact remains visible around object feet. */
    bakedFloorCoreRadiusM: 0.025,

    /**
     * Max top-down hull tighten for small tabletop props when their world XZ footprint is large
     * (chunky mesh hull). Tiny placed instances stay near 1.0 so shadows stay visible.
     */
    bakedFloorCompactHullScale: 0.82,

    /** Below this world XZ span (m), compact props use the full mesh hull. */
    bakedFloorCompactSpanMinM: 0.03,

    /** Above this world XZ span (m), compact props reach {@link bakedFloorCompactHullScale}. */
    bakedFloorCompactSpanMaxM: 0.14,

    /** Loose cigarettes (not packs) — smaller silhouettes at every footprint. */
    bakedFloorCigaretteHullScaleMin: 0.62,

    bakedFloorCigaretteHullScale: 0.48,

    bakedFloorCigaretteSpanMinM: 0.008,

    bakedFloorCigaretteSpanMaxM: 0.06,

    /** Finer hull sampling so sub-quantized cigarettes still produce a silhouette. */
    bakedFloorCigarettePointQuantizeM: 0.006,

    /** Smallest loose-cigarette shadow radius (m) after hull tighten. */
    bakedFloorCigaretteMinHullRadiusM: 0.014,

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

  | "growOp"

  | "tv"

  | "computer";



export function apartmentDecorEmitterKindFromModelPath(

  modelRelPath: string,

): ApartmentDecorEmitterKind | null {

  const lower = modelRelPath.toLowerCase().replace(/\\/gu, "/");

  if (lower.includes("chandelier")) return "chandelier";

  if (lower.includes("light-grow-op")) return "growOp";

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

  const emitterKind = apartmentDecorEmitterKindFromModelPath(modelRelPath);
  if (
    emitterKind != null &&
    emitterKind !== "tv" &&
    emitterKind !== "computer"
  ) {
    return false;
  }

  if (lower.includes("rug")) return false;

  if (lower.includes("light-")) return false;

  if (lower.includes("wall-clock")) return false;

  if (lower.includes("painting")) return false;

  if (lower.includes("coat-hanger")) return false;

  if (lower.includes("kelp")) return false;

  if (lower.includes("window-shutter")) return false;

  return true;

}



/**
 * Baked floor shadows hug the decor AABB foot by default; these props are often elevated on
 * counters/tables but should still cast onto the unit shell floor.
 */
export function apartmentDecorBakedFloorShadowSnapToShellFloor(
  modelRelPath: string,
): boolean {
  const lower = modelRelPath.toLowerCase().replace(/\\/gu, "/");
  return (
    lower.endsWith("/objects/sink.glb") ||
    lower.includes("/objects/sink.glb") ||
    lower.endsWith("/objects/water-tank.glb") ||
    lower.includes("/objects/water-tank.glb")
  );
}



function apartmentDecorIsCigaretteDecorModel(lower: string): boolean {
  return (
    lower.includes("cigarette-pack") ||
    lower.includes("used-cigarette") ||
    lower.endsWith("/cigarette.glb")
  );
}

/** Single cigarettes / butts — not packs. */
export function apartmentDecorIsLooseCigaretteDecorModel(modelRelPath: string): boolean {
  const lower = modelRelPath.toLowerCase().replace(/\\/gu, "/");
  if (lower.includes("cigarette-pack")) return false;
  return lower.endsWith("/cigarette.glb") || lower.includes("used-cigarette");
}

function apartmentDecorUsesCompactBakedFloorShadow(modelRelPath: string): boolean {
  const lower = modelRelPath.toLowerCase().replace(/\\/gu, "/");
  return (
    lower.includes("/objects/ashtray.glb") ||
    lower.includes("/objects/beer-can.glb") ||
    lower.includes("/objects/empty-beer-can-ozujsko.glb") ||
    lower.includes("/objects/coffee-cup-empty.glb") ||
    lower.includes("/objects/rakija.glb") ||
    lower.includes("/objects/rakija-2.glb") ||
    apartmentDecorIsCigaretteDecorModel(lower)
  );
}

/**
 * Tighter baked floor silhouettes for small props whose convex hull reads oversized.
 * Shrink amount follows world XZ footprint so tiny placed instances keep visible shadows.
 */
export function apartmentDecorBakedFloorShadowHullScale(
  modelRelPath: string,
  decorBoundsSize: THREE.Vector3,
): number {
  if (!apartmentDecorUsesCompactBakedFloorShadow(modelRelPath)) {
    return 1;
  }
  const cfg = APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow;
  const looseCigarette = apartmentDecorIsLooseCigaretteDecorModel(modelRelPath);
  const span = Math.max(decorBoundsSize.x, decorBoundsSize.z);
  const spanMin = looseCigarette
    ? cfg.bakedFloorCigaretteSpanMinM
    : cfg.bakedFloorCompactSpanMinM;
  const spanMax = looseCigarette
    ? cfg.bakedFloorCigaretteSpanMaxM
    : cfg.bakedFloorCompactSpanMaxM;
  const hullMin = looseCigarette ? cfg.bakedFloorCigaretteHullScaleMin : 1;
  const hullMax = looseCigarette
    ? cfg.bakedFloorCigaretteHullScale
    : cfg.bakedFloorCompactHullScale;
  const spanRange = spanMax - spanMin;
  const t =
    spanRange > 1e-6
      ? THREE.MathUtils.clamp((span - spanMin) / spanRange, 0, 1)
      : 1;
  return THREE.MathUtils.lerp(hullMin, hullMax, t);
}



/** Remap raw doorway proximity into the lighting blend factor (0 = exterior, 1 = full flat). */

export function mammothApartmentInteriorBlend01(interiorProximity01: number): number {

  const raw = THREE.MathUtils.clamp(interiorProximity01, 0, 1);

  return Math.pow(raw, APARTMENT_INTERIOR_VISUAL_PROFILE.scene.doorwayBlendExponent);

}



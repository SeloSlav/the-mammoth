import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshStandardNodeMaterial, NodeMaterial } from "three/webgpu";
import {
  add,
  div,
  dot,
  float,
  max,
  mix,
  positionWorld,
  smoothstep,
  sub,
  texture,
  triNoise3D,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { SkyCloudMesh } from "sky-cloud-3d";
import { FP_OUTDOOR_GROUND_VISUAL_Y } from "@the-mammoth/world";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  applyMammothApartmentInteriorLightLayersToGlobalRig,
  applyMammothApartmentInteriorScene,
  mountMammothApartmentInteriorBounceRig,
} from "@the-mammoth/engine";
import {
  FP_APARTMENT_DECOR_PROP_LAYER,
  FP_RESIDENTIAL_UNIT_INTERIOR_LAYER,
} from "./fpSessionConstants.js";

const GRASS_GROUND_TEX_BASE = "/static/materials/grass-ground";
/** Packed foot-worn soil / mud — basecolor / normal / roughness only (same stem as grass-ground). */
const DIRT_GROUND_TEX_BASE = "/static/materials/terrain-dirt";
/** Coarse yard gravel / crushed stone — same filenames as grass-ground. */
const GRAVEL_GROUND_TEX_BASE = "/static/materials/terrain-gravel";
/** Dormant straw / dead grass patches — same filenames as grass-ground. */
const DEAD_GRASS_GROUND_TEX_BASE = "/static/materials/dead-grass-ground";
/** Planar tile size (m) on the infinite FP ground plane — ~2.5 m matches podium slab tiling scale. */
const GRASS_GROUND_TILE_M = 2.5;
const FP_GROUND_PLANE_SIZE = 6000;
/**
 * Default `PlaneGeometry` is 1×1 segments (two triangles). Tangent-space `normalMap` on that mesh
 * can show **black wedge / zig-zag seams** along the diagonal from inconsistent tangent basis.
 * A handful of segments is more than enough to break up the diagonal at any viewing distance —
 * previously 96×96 = 18,432 triangles, now 8×8 = 128 triangles (144× cheaper, no visible difference
 * at any realistic view since the per-segment tile is still ~750 m across on the 6000 m plane).
 */
const FP_GROUND_PLANE_SEGMENTS = 8;
/** World-space scale for `triNoise3D` — dirt mask. */
const GROUND_DIRT_NOISE_SCALE = 0.022;
/** Live grass (sparse green) mask — slightly different scale so it doesn’t lock-step with dirt. */
const GROUND_LIVE_GRASS_NOISE_SCALE = 0.0165;
/** Dead grass mask — broad scrub patches. */
const GROUND_DEAD_GRASS_NOISE_SCALE = 0.011;
/** Gravel clusters (only steals from dirt after normalization). */
const GROUND_GRAVEL_NOISE_SCALE = 0.038;
/**
 * Raw weights are smoothstep’d then normalized so all three ground types share coverage.
 * (Previously dead grass was `(1-dirt)*…`, which made live grass dominate.)
 */
const GROUND_WEIGHT_DIRT_LO = 0.26;
const GROUND_WEIGHT_DIRT_HI = 0.52;
const GROUND_WEIGHT_DEAD_LO = 0.24;
const GROUND_WEIGHT_DEAD_HI = 0.54;
const GROUND_WEIGHT_LIVE_LO = 0.2;
const GROUND_WEIGHT_LIVE_HI = 0.5;
/** Keep a little default coverage so all-three-zero regions don't collapse to black. */
const GROUND_LIVE_GRASS_BASELINE = 0.08;
const GROUND_DIRT_BASELINE = 0.02;
const GROUND_DEAD_GRASS_BASELINE = 0.02;
/** Max fraction of the dirt weight that can become gravel (0..1). */
const GROUND_GRAVEL_OF_DIRT_MAX = 0.42;
const GROUND_GRAVEL_EDGE_LO = 0.58;
const GROUND_GRAVEL_EDGE_HI = 0.78;
/** World meters across one full cycle of the macro mask (soft large-scale albedo breakup). */
const GROUND_MACRO_TILE_M = 420;
/** Macro mask scales albedo: `lerp(1, macro, strength)` — keep subtle to avoid banding. */
const GROUND_MACRO_ALBEDO_STRENGTH = 0.12;
/** Resolution of the generated tileable macro grayscale (CPU once per session). */
const GROUND_MACRO_TEX_SIZE = 256;

/**
 * Tileable low-frequency grayscale (sin/cos, periodic on [0,1)²) — breaks uniform tiling
 * without an external texture asset.
 */
function createTilableMacroGrayTexture(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size);
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const a =
        Math.sin(u * TAU * 2 + 0.71) * Math.cos(v * TAU * 2 + 0.29) * 0.5 + 0.5;
      const b = Math.sin((u + v * 0.68) * TAU * 3 + 1.07) * 0.5 + 0.5;
      const c = Math.sin(u * TAU + v * TAU * 1.47 + 0.33) * 0.5 + 0.5;
      const n = THREE.MathUtils.clamp(a * 0.44 + b * 0.33 + c * 0.23, 0, 1);
      data[y * size + x] = Math.floor(n * 255);
    }
  }
  const tex = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  tex.name = "fp_ground_macro_gray";
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

type GroundPbrSet = {
  baseColor: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
};

function groundPbrUrls(base: string): [string, string, string] {
  return [
    `${base}/basecolor.png`,
    `${base}/normal.png`,
    `${base}/roughness.png`,
  ];
}

/**
 * Outdoor FP backdrop: [sky-cloud-3d](https://github.com/xiaxiangfeng/sky-cloud-3d) physical sky +
 * volumetric cloud dome (WebGPU / TSL), horizon fog, infinite ground plane, and sun-matched lights.
 * Keeps {@link mountFpSession} focused on session lifecycle (net, input, sim) vs scene authoring.
 */

/** Skydome sphere radius (m). The FP camera must use {@link FP_SESSION_SKY_CAMERA_FAR} &gt; this. */
export const FP_SESSION_SKY_RADIUS = 20_000 as const;
/** Default `createFPRig` uses `far: 900` — too small; inner surface of the sky sphere is at this distance. */
export const FP_SESSION_SKY_CAMERA_FAR = 25_000 as const;

/** Residual chroma in {@link wireBrutalistSkyDome} (lower = more concrete-gray). */
const SKY_DOME_CHROMA = 0.34 as const;
const SKY_DOME_SHADOW_FLOOR = 0.52 as const;
const LUMINANCE = vec3(0.2126, 0.7152, 0.0722);

/**
 * sky-cloud-3d is still a physical sky: Rayleigh/Mie coefficients are R&lt;B, so "low rayleigh" only
 * scales blue down — it can’t go neutral. Rewrap the final TSL `colorNode` to blend toward luma.
 */
function wireBrutalistSkyDome(sky: SkyCloudMesh): void {
  const mat = sky.material as NodeMaterial;
  const inner = mat.colorNode;
  if (!inner) {
    return;
  }
  // `NodeMaterial.colorNode` is vec4 in TSL; the TS union type doesn’t expose `.xyz`.
  const c = inner as { xyz: ReturnType<typeof vec3> };
  const lumaN = dot(c.xyz, LUMINANCE);
  /**
   * The stock shader lets the densest cloud pockets fall very dark on the underside. Lift only the
   * lowest-luma band toward a neutral concrete gray so the overcast stays readable instead of
   * punching black holes into the ceiling.
   */
  const liftedShadowMix = smoothstep(float(0.03), float(0.32), lumaN);
  const liftedRgb = mix(vec3(SKY_DOME_SHADOW_FLOOR), c.xyz, liftedShadowMix);
  const liftedLuma = dot(liftedRgb, LUMINANCE);
  const rgb = mix(vec3(liftedLuma), liftedRgb, float(SKY_DOME_CHROMA));
  mat.colorNode = vec4(rgb, float(1));
}

export type FpSessionEnvironmentHandle = {
  dispose: () => void;
  onFrame: (args: {
    camera: THREE.Camera;
    nowSec: number;
    viewWidthPx: number;
    viewHeightPx: number;
    apartmentInteriorBounds?: {
      minX: number;
      minY: number;
      minZ: number;
      maxX: number;
      maxY: number;
      maxZ: number;
    } | null;
    /** 0 = normal exterior/interior balance; 1 = full abandoned-flat dimming while inside a unit. */
    apartmentInteriorDark01?: number;
    /**
     * 0 = normal exterior fill; 1 = apply full stair-shaft interior dimming (smooth blend in
     * {@link mountFpSession}).
     */
    stairwellInteriorDark01?: number;
  }) => FpSessionEnvironmentFrameTimings;
};

export type FpSessionEnvironmentFrameTimings = {
  totalMs: number;
  /** Sky/cloud time-domain + camera + resolution updates. */
  skyMs: number;
  /** Light/exposure updates that remain after the sky pass. */
  lightingMs: number;
};

export function attachFpSessionEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGPURenderer,
): FpSessionEnvironmentHandle {
  const clipCompatibleRenderer = renderer as THREE.WebGPURenderer & {
    localClippingEnabled?: boolean;
    clippingPlanes?: THREE.Plane[];
  };
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  clipCompatibleRenderer.localClippingEnabled = true;
  /** Overcast daylight, but tuned so panel yards don’t punch past the gritty interior mood on entry. */
  renderer.toneMappingExposure = APARTMENT_INTERIOR_VISUAL_PROFILE.exposure.exterior;
  const apartmentClipPlanes = [
    new THREE.Plane(),
    new THREE.Plane(),
    new THREE.Plane(),
    new THREE.Plane(),
    new THREE.Plane(),
    new THREE.Plane(),
  ];
  const APARTMENT_CLIP_XZ_PAD_M = 0.22;
  const APARTMENT_CLIP_Y_PAD_BOTTOM_M = 0.1;
  const APARTMENT_CLIP_Y_PAD_TOP_M = 0.18;
  const applyApartmentInteriorClip = (
    bounds:
      | {
          minX: number;
          minY: number;
          minZ: number;
          maxX: number;
          maxY: number;
          maxZ: number;
        }
      | null,
  ): void => {
    if (!bounds) {
      clipCompatibleRenderer.clippingPlanes = [];
      return;
    }
    const minX = bounds.minX - APARTMENT_CLIP_XZ_PAD_M;
    const maxX = bounds.maxX + APARTMENT_CLIP_XZ_PAD_M;
    const minY = bounds.minY - APARTMENT_CLIP_Y_PAD_BOTTOM_M;
    const maxY = bounds.maxY + APARTMENT_CLIP_Y_PAD_TOP_M;
    const minZ = bounds.minZ - APARTMENT_CLIP_XZ_PAD_M;
    const maxZ = bounds.maxZ + APARTMENT_CLIP_XZ_PAD_M;
    apartmentClipPlanes[0]!.normal.set(1, 0, 0);
    apartmentClipPlanes[0]!.constant = -minX;
    apartmentClipPlanes[1]!.normal.set(-1, 0, 0);
    apartmentClipPlanes[1]!.constant = maxX;
    apartmentClipPlanes[2]!.normal.set(0, 1, 0);
    apartmentClipPlanes[2]!.constant = -minY;
    apartmentClipPlanes[3]!.normal.set(0, -1, 0);
    apartmentClipPlanes[3]!.constant = maxY;
    apartmentClipPlanes[4]!.normal.set(0, 0, 1);
    apartmentClipPlanes[4]!.constant = -minZ;
    apartmentClipPlanes[5]!.normal.set(0, 0, -1);
    apartmentClipPlanes[5]!.constant = maxZ;
    clipCompatibleRenderer.clippingPlanes = apartmentClipPlanes;
  };

  const sunDir = new THREE.Vector3();
  /** Low Zagreb afternoon sun with enough elevation to keep exterior trees from silhouetting. */
  const sunElevationDeg = 22;
  const sunAzimuthDeg = 198;
  sunDir.setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - sunElevationDeg),
    THREE.MathUtils.degToRad(sunAzimuthDeg),
  );

  /** Sky + clouds fill the view; no solid clear color. */
  scene.background = null;

  /**
   * Neutral studio PMREM for selectively readable metallic GLBs. Do not install it as the global
   * `scene.environment`: the fast `ed49c903` path avoided environment sampling on every static
   * building/interior `MeshStandardMaterial`, which matters far more than a handful of metal props.
   */
  const fpSessionPmrem = new THREE.PMREMGenerator(renderer);
  const fpSessionEnvTarget = fpSessionPmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = null;
  scene.userData.mammothFpMetallicReadableEnv = fpSessionEnvTarget.texture;

  /** Keep the global environment path disabled; selected metallic GLBs receive the PMREM directly. */
  scene.environmentIntensity = 1;

  const viewSize = new THREE.Vector2();
  renderer.getSize(viewSize);
  const sky = new SkyCloudMesh({
    sunDirection: sunDir,
    /**
     * Broken overcast: still concrete-gray, but no longer crushes the whole yard into gloom.
     */
    cloudCoverage: 0.54,
    /** Cloud band height — a bit lower so the layer feels like stratus scud, not a second sky. */
    cloudHeight: 460,
    /**
     * Thinner slab = less vertical smear in the raymarch, crisper silhouettes; pairs with lower
     * coverage so shapes don’t all merge in the thickness.
     */
    cloudThickness: 38,
    /** Slow drift — "nothing ever happens out here" pacing. */
    windSpeedX: 0.42,
    windSpeedZ: 0.28,
    /** Softer edges and more semi-transparent wisp (thick clouds read as one grey wall). */
    cloudAbsorption: 0.82,
    maxCloudDistance: 10_000.0,
    /**
     * Push smog; Rayleigh is still wavelength-weighted in-shader, so it never goes fully neutral
     * from uniforms alone — we also desaturate {@link wireBrutalistSkyDome} on `colorNode`.
     */
    rayleigh: 0.08,
    turbidity: 3.8,
    hazeStrength: 0.42,
    mieCoefficient: 0.0044,
    mieDirectionalG: 0.28,
    radius: FP_SESSION_SKY_RADIUS,
    widthSegments: 40,
    heightSegments: 20,
    width: viewSize.x,
    height: viewSize.y,
  });
  wireBrutalistSkyDome(sky);

  scene.add(sky);

  /**
   * Match the plate mood without crushing distance to black — slightly brighter and farther `far`
   * so the yard reads as weathered concrete, not a void.
   */
  scene.fog = new THREE.Fog(0xd0d4cf, 120, 1350);

  type LoadedTex = THREE.Texture;
  const groundTextures: LoadedTex[] = [];
  let groundPlaneDisposed = false;

  const pushTerrainTexture = (t: LoadedTex): void => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    /** Planar UV from world XZ is already in tile units; keep texture repeat at 1. */
    t.repeat.set(1, 1);
    t.anisotropy = 8;
    t.needsUpdate = true;
    groundTextures.push(t);
  };

  const groundMat = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    emissive: 0x0c100c,
    emissiveIntensity: 0.12,
  });

  const macroVariationTex = createTilableMacroGrayTexture(
    GROUND_MACRO_TEX_SIZE,
  );
  pushTerrainTexture(macroVariationTex);

  const loader = new THREE.TextureLoader();
  void (async () => {
    const disposeAll = (texs: THREE.Texture[]) => {
      for (const t of texs) t.dispose();
    };
    const loadGroundSet = async (base: string): Promise<GroundPbrSet> => {
      const loaded = await Promise.all(
        groundPbrUrls(base).map((u) => loader.loadAsync(u)),
      );
      const [baseColor, normal, roughness] = loaded as [
        THREE.Texture,
        THREE.Texture,
        THREE.Texture,
      ];
      return { baseColor, normal, roughness };
    };
    try {
      const grassSet = await loadGroundSet(GRASS_GROUND_TEX_BASE);
      let dirtSet = grassSet;
      let gravelSet = grassSet;
      let deadGrassSet = grassSet;
      let useDirtBlend = true;
      let useGravelBlend = true;
      let useDeadGrassBlend = true;
      try {
        dirtSet = await loadGroundSet(DIRT_GROUND_TEX_BASE);
      } catch {
        useDirtBlend = false;
        console.warn(
          "[fpSessionEnvironment] terrain-dirt PBR set missing — add files under",
          DIRT_GROUND_TEX_BASE,
        );
      }
      try {
        gravelSet = await loadGroundSet(GRAVEL_GROUND_TEX_BASE);
      } catch {
        useGravelBlend = false;
        console.warn(
          "[fpSessionEnvironment] terrain-gravel PBR set missing — add files under",
          GRAVEL_GROUND_TEX_BASE,
        );
      }
      try {
        deadGrassSet = await loadGroundSet(DEAD_GRASS_GROUND_TEX_BASE);
      } catch {
        useDeadGrassBlend = false;
        console.warn(
          "[fpSessionEnvironment] dead-grass-ground PBR set missing — add files under",
          DEAD_GRASS_GROUND_TEX_BASE,
        );
      }
      if (groundPlaneDisposed) {
        disposeAll(Object.values(grassSet));
        if (useDirtBlend) disposeAll(Object.values(dirtSet));
        if (useGravelBlend) disposeAll(Object.values(gravelSet));
        if (useDeadGrassBlend) disposeAll(Object.values(deadGrassSet));
        return;
      }
      grassSet.baseColor.colorSpace = THREE.SRGBColorSpace;
      dirtSet.baseColor.colorSpace = THREE.SRGBColorSpace;
      gravelSet.baseColor.colorSpace = THREE.SRGBColorSpace;
      deadGrassSet.baseColor.colorSpace = THREE.SRGBColorSpace;
      const loadedSet = new Set<unknown>();
      for (const tex of Object.values(grassSet)) {
        pushTerrainTexture(tex);
        loadedSet.add(tex);
      }
      for (const set of [dirtSet, gravelSet, deadGrassSet]) {
        for (const tex of Object.values(set)) {
          if (!loadedSet.has(tex)) {
            pushTerrainTexture(tex);
            loadedSet.add(tex);
          }
        }
      }

      const uv = vec2(positionWorld.x, positionWorld.z).div(
        float(GRASS_GROUND_TILE_M),
      );
      const macroUv = vec2(positionWorld.x, positionWorld.z).div(
        float(GROUND_MACRO_TILE_M),
      );
      const grassCol = texture(grassSet.baseColor, uv);
      const dirtCol = texture(dirtSet.baseColor, uv);
      const gravelCol = texture(gravelSet.baseColor, uv);
      const deadGrassCol = texture(deadGrassSet.baseColor, uv);
      const grassRough = texture(grassSet.roughness, uv);
      const dirtRough = texture(dirtSet.roughness, uv);
      const gravelRough = texture(gravelSet.roughness, uv);
      const deadGrassRough = texture(deadGrassSet.roughness, uv);
      const macro = texture(macroVariationTex, macroUv);

      const dirtNoise = triNoise3D(
        positionWorld.mul(float(GROUND_DIRT_NOISE_SCALE)),
        float(0),
        float(0),
      );
      const liveGrassNoise = triNoise3D(
        positionWorld
          .mul(float(GROUND_LIVE_GRASS_NOISE_SCALE))
          .add(vec3(101.3, 0, -55.8)),
        float(0),
        float(0),
      );
      const deadGrassNoise = triNoise3D(
        positionWorld
          .mul(float(GROUND_DEAD_GRASS_NOISE_SCALE))
          .add(vec3(31.7, 0, -19.4)),
        float(0),
        float(0),
      );
      const gravelNoise = triNoise3D(
        positionWorld
          .mul(float(GROUND_GRAVEL_NOISE_SCALE))
          .add(vec3(-47.2, 0, 22.1)),
        float(0),
        float(0),
      );

      const rawDirt = useDirtBlend
        ? smoothstep(
            float(GROUND_WEIGHT_DIRT_LO),
            float(GROUND_WEIGHT_DIRT_HI),
            dirtNoise,
          ).add(float(GROUND_DIRT_BASELINE))
        : float(0);
      const rawDead = useDeadGrassBlend
        ? smoothstep(
            float(GROUND_WEIGHT_DEAD_LO),
            float(GROUND_WEIGHT_DEAD_HI),
            deadGrassNoise,
          ).add(float(GROUND_DEAD_GRASS_BASELINE))
        : float(0);
      const rawLive = smoothstep(
        float(GROUND_WEIGHT_LIVE_LO),
        float(GROUND_WEIGHT_LIVE_HI),
        liveGrassNoise,
      ).add(float(GROUND_LIVE_GRASS_BASELINE));
      const sumPrimary = max(add(add(rawDirt, rawDead), rawLive), float(1e-4));
      const wDirt = div(rawDirt, sumPrimary);
      const wDead = div(rawDead, sumPrimary);
      const wLive = div(rawLive, sumPrimary);

      const gravelOfDirt = useGravelBlend
        ? smoothstep(
            float(GROUND_GRAVEL_EDGE_LO),
            float(GROUND_GRAVEL_EDGE_HI),
            gravelNoise,
          ).mul(float(GROUND_GRAVEL_OF_DIRT_MAX))
        : float(0);
      const wGravel = wDirt.mul(gravelOfDirt);
      const wDirtVis = wDirt.mul(float(1).sub(gravelOfDirt));

      const baseRgb = grassCol.rgb
        .mul(wLive)
        .add(dirtCol.rgb.mul(wDirtVis))
        .add(deadGrassCol.rgb.mul(wDead))
        .add(gravelCol.rgb.mul(wGravel));
      const macroCenter = sub(macro.r, float(0.5)).mul(float(2));
      const macroMul = macroCenter
        .mul(float(GROUND_MACRO_ALBEDO_STRENGTH))
        .add(float(1));
      groundMat.colorNode = vec4(baseRgb.mul(macroMul), float(1));
      /**
       * Stay matte under overcast light: blend roughness maps toward higher roughness and keep
       * the whole surface dielectric (`metalnessNode = 0` — no metalness map).
       */
      const rawRough = grassRough.r
        .mul(wLive)
        .add(dirtRough.r.mul(wDirtVis))
        .add(deadGrassRough.r.mul(wDead))
        .add(gravelRough.r.mul(wGravel));
      groundMat.roughnessNode = mix(float(0.9), rawRough, float(0.24));
      groundMat.metalnessNode = float(0);
      groundMat.normalMap = grassSet.normal as THREE.Texture | null;
      groundMat.normalScale.set(0.45, 0.45);
      groundMat.needsUpdate = true;
    } catch (err) {
      console.warn(
        "[fpSessionEnvironment] grass ground textures failed to load",
        err,
      );
    }
  })();

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(
      FP_GROUND_PLANE_SIZE,
      FP_GROUND_PLANE_SIZE,
      FP_GROUND_PLANE_SEGMENTS,
      FP_GROUND_PLANE_SEGMENTS,
    ),
    groundMat,
  );
  groundPlane.name = "fp_session_ground_plane";
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = FP_OUTDOOR_GROUND_VISUAL_Y;
  groundPlane.frustumCulled = false;
  groundPlane.castShadow = false;
  groundPlane.receiveShadow = false;
  scene.add(groundPlane);

  const exteriorRig = APARTMENT_INTERIOR_VISUAL_PROFILE.exteriorRig;
  /**
   * Stair cores should feel visibly dimmer than the exterior overcast fill instead of sharing the same
   * exposure curve. This is a global multiplier only; apartment-local lights layer on top below.
   */
  const STAIRWELL_INTERIOR_LIGHT_SCALE = 0.62;

  const hemi = new THREE.HemisphereLight(
    exteriorRig.hemiSky,
    exteriorRig.hemiGround,
    exteriorRig.hemiIntensity,
  );
  const fill = new THREE.AmbientLight(exteriorRig.fill, exteriorRig.fillIntensity);
  const dir = new THREE.DirectionalLight(exteriorRig.dir, exteriorRig.dirIntensity);
  dir.position.copy(sunDir.clone().multiplyScalar(120));
  applyMammothApartmentInteriorLightLayersToGlobalRig({ hemi, fill, dir });
  scene.add(hemi, fill, dir);

  /** Shared dark rig for both corridor and residential layers to avoid per-layer brightness seams. */

  const apartmentInteriorBounce = mountMammothApartmentInteriorBounceRig(
    scene,
    "fp_residential_interior",
  );

  const disposeMaterial = (m: THREE.Material | THREE.Material[]) => {
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m.dispose();
  };

  return {
    onFrame: ({
      camera,
      nowSec,
      viewWidthPx,
      viewHeightPx,
      apartmentInteriorBounds: _apartmentInteriorBounds = null,
      apartmentInteriorDark01 = 0,
      stairwellInteriorDark01 = 0,
    }) => {
      const t0 = performance.now();
      applyApartmentInteriorClip(_apartmentInteriorBounds);
      sky.updateTime(nowSec);
      sky.updateSun(sunDir);
      sky.updateCamera(camera);
      sky.updateResolution(viewWidthPx, viewHeightPx);
      const tAfterSky = performance.now();

      const stair01 = THREE.MathUtils.clamp(stairwellInteriorDark01, 0, 1);
      const stairwellScale = THREE.MathUtils.lerp(
        1,
        STAIRWELL_INTERIOR_LIGHT_SCALE,
        stair01,
      );
      applyMammothApartmentInteriorScene({
        scene,
        renderer,
        interiorProximity01: apartmentInteriorDark01,
        bounce: apartmentInteriorBounce,
        global: { hemi, fill, dir },
        exteriorLightScale: stairwellScale,
      });
      dir.position.copy(sunDir).multiplyScalar(120);
      const tEnd = performance.now();
      return {
        totalMs: tEnd - t0,
        skyMs: tAfterSky - t0,
        lightingMs: tEnd - tAfterSky,
      };
    },
    dispose: () => {
      clipCompatibleRenderer.clippingPlanes = [];
      scene.background = null;
      scene.environment = null;
      delete scene.userData.mammothFpMetallicReadableEnv;
      fpSessionEnvTarget.dispose();
      fpSessionPmrem.dispose();

      scene.remove(sky);
      sky.dispose();

      groundPlaneDisposed = true;
      scene.remove(groundPlane);
      groundPlane.geometry.dispose();
      for (const t of groundTextures) t.dispose();
      groundTextures.length = 0;
      disposeMaterial(groundPlane.material);

      scene.remove(
        hemi,
        fill,
        dir,
        apartmentInteriorBounce.bounceHemi,
        apartmentInteriorBounce.bounceFill,
        apartmentInteriorBounce.bounceDir,
      );
      hemi.dispose();
      fill.dispose();
      dir.dispose();
      apartmentInteriorBounce.bounceHemi.dispose();
      apartmentInteriorBounce.bounceFill.dispose();
      apartmentInteriorBounce.bounceDir.dispose();

      scene.fog = null;
    },
  };
}

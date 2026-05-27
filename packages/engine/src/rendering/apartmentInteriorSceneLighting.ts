import * as THREE from "three";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  mammothApartmentInteriorBlend01,
} from "./apartmentInteriorVisualProfile.js";
import { applyMammothApartmentInteriorLightLayers } from "./apartmentInteriorLayers.js";
import {
  bindMammothApartmentPropReadableEnv,
  bindMammothResidentialShellIndirectEnv,
} from "./bindMammothApartmentDecorIndirectEnv.js";
import {
  apartmentInteriorShellWarmEnvFromScene,
  MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD,
} from "./apartmentInteriorWarmEnv.js";

export {
  APARTMENT_INTERIOR_PREVIEW_BACKGROUND,
} from "./apartmentInteriorVisualProfile.js";

/** Window-ish direction for soft interior directional (world space, not normalized). */
const INTERIOR_BOUNCE_DIR_POSITION = new THREE.Vector3(-18, 42, -28);

export type MammothApartmentInteriorBounceRig = {
  bounceHemi: THREE.HemisphereLight;
  bounceFill: THREE.AmbientLight;
  bounceDir: THREE.DirectionalLight;
};

export type MammothApartmentInteriorGlobalRig = {
  hemi: THREE.HemisphereLight;
  fill: THREE.AmbientLight;
  dir: THREE.DirectionalLight;
};

export type MammothApartmentInteriorAtmosphereRestore = {
  background: THREE.Color;
  fog: THREE.Fog | THREE.FogExp2 | null;
};

export type MammothApartmentInteriorSceneRigMount = MammothApartmentInteriorBounceRig & {
  dispose: () => void;
};

export function captureMammothApartmentInteriorSceneAtmosphere(
  scene: THREE.Scene,
): MammothApartmentInteriorAtmosphereRestore {
  const bg =
    scene.background instanceof THREE.Color
      ? scene.background.clone()
      : new THREE.Color(0xe8edf4);
  return { background: bg, fog: scene.fog };
}

export function syncMammothApartmentInteriorSceneAtmosphere(
  scene: THREE.Scene,
  interiorActive: boolean,
  restore: MammothApartmentInteriorAtmosphereRestore,
): void {
  if (interiorActive) {
    scene.background = new THREE.Color(
      APARTMENT_INTERIOR_VISUAL_PROFILE.scene.background,
    );
    scene.fog = null;
    return;
  }
  scene.background = restore.background.clone();
  scene.fog = restore.fog;
}

/**
 * Low-level lighting sync — prefer {@link applyMammothApartmentInteriorScene} so editor and FP
 * stay aligned on exposure, atmosphere, and rig intensities.
 */
export function syncMammothApartmentInteriorSceneLighting(input: {
  renderer: THREE.WebGPURenderer;
  /** Already remapped blend factor (0 = exterior, 1 = full flat). */
  interior01: number;
  bounce: MammothApartmentInteriorBounceRig;
  global?: MammothApartmentInteriorGlobalRig;
  exteriorLightScale?: number;
  exteriorHemiIntensity?: number;
  exteriorFillIntensity?: number;
  exteriorDirIntensity?: number;
  /** Multiplier on {@link APARTMENT_INTERIOR_VISUAL_PROFILE.interiorBounce} — hallways use profile `circulation.bounceScale`. */
  interiorBounceScale?: number;
}): void {
  const t = THREE.MathUtils.clamp(input.interior01, 0, 1);
  const profile = APARTMENT_INTERIOR_VISUAL_PROFILE;
  const ambient = profile.interiorAmbient;
  const bounce = profile.interiorBounce;
  const exterior = profile.exteriorRig;

  input.renderer.toneMappingExposure = THREE.MathUtils.lerp(
    profile.exposure.exterior,
    profile.exposure.interior,
    t,
  );

  if (input.global) {
    const scale = input.exteriorLightScale ?? 1;
    const hemiExt = input.exteriorHemiIntensity ?? exterior.hemiIntensity;
    const fillExt = input.exteriorFillIntensity ?? exterior.fillIntensity;
    const dirExt = input.exteriorDirIntensity ?? exterior.dirIntensity;
    if (t > 0.001) {
      input.global.hemi.color.setHex(ambient.hemiSky);
      input.global.hemi.groundColor.setHex(ambient.hemiGround);
      input.global.fill.color.setHex(ambient.fill);
      input.global.dir.color.setHex(ambient.dir);
    } else {
      input.global.hemi.color.setHex(exterior.hemiSky);
      input.global.hemi.groundColor.setHex(exterior.hemiGround);
      input.global.fill.color.setHex(exterior.fill);
      input.global.dir.color.setHex(exterior.dir);
    }
    input.global.hemi.intensity = THREE.MathUtils.lerp(
      hemiExt * scale,
      ambient.hemiIntensity,
      t,
    );
    input.global.fill.intensity = THREE.MathUtils.lerp(
      fillExt * scale,
      ambient.fillIntensity,
      t,
    );
    input.global.dir.intensity = THREE.MathUtils.lerp(
      dirExt * scale,
      ambient.dirIntensity,
      t,
    );
  }

  input.bounce.bounceHemi.color.setHex(bounce.hemiSky);
  input.bounce.bounceHemi.groundColor.setHex(bounce.hemiGround);
  const bounceScale = input.interiorBounceScale ?? 1;
  input.bounce.bounceHemi.intensity = bounce.hemiIntensity * t * bounceScale;
  input.bounce.bounceFill.color.setHex(bounce.fill);
  input.bounce.bounceFill.intensity = bounce.fillIntensity * t * bounceScale;
  input.bounce.bounceDir.color.setHex(bounce.dir);
  input.bounce.bounceDir.intensity = bounce.dirIntensity * t * bounceScale;
}

/**
 * **Single entry point** for apartment interior scene state — editor layout (`interiorProximity01 = 1`)
 * and FP session (doorway proximity) must both call this (plus {@link syncMammothApartmentInteriorMetallicEnv}).
 */
export function applyMammothApartmentInteriorScene(input: {
  scene: THREE.Scene;
  renderer: THREE.WebGPURenderer;
  /** Raw 0..1 proximity; remapped with {@link mammothApartmentInteriorBlend01}. Editor: pass `1`. */
  interiorProximity01: number;
  bounce: MammothApartmentInteriorBounceRig;
  global?: MammothApartmentInteriorGlobalRig;
  exteriorLightScale?: number;
  exteriorHemiIntensity?: number;
  exteriorFillIntensity?: number;
  exteriorDirIntensity?: number;
  interiorBounceScale?: number;
  /**
   * Editor studio: pass captured atmosphere so leaving layout mode restores orbit slab fog/background.
   * Omit for FP (sky owns exterior background).
   */
  atmosphereRestore?: MammothApartmentInteriorAtmosphereRestore;
}): number {
  const interior01 = mammothApartmentInteriorBlend01(input.interiorProximity01);
  const profile = APARTMENT_INTERIOR_VISUAL_PROFILE;
  const atmosphereActive =
    interior01 > profile.scene.atmosphereActiveThreshold;

  input.scene.environmentIntensity = profile.scene.environmentIntensity;

  if (input.atmosphereRestore) {
    syncMammothApartmentInteriorSceneAtmosphere(
      input.scene,
      atmosphereActive,
      input.atmosphereRestore,
    );
  } else if (atmosphereActive) {
    input.scene.background = new THREE.Color(profile.scene.background);
    input.scene.fog = null;
  } else {
    input.scene.background = null;
  }

  syncMammothApartmentInteriorSceneLighting({
    renderer: input.renderer,
    interior01,
    bounce: input.bounce,
    global: input.global,
    exteriorLightScale: input.exteriorLightScale,
    exteriorHemiIntensity: input.exteriorHemiIntensity,
    exteriorFillIntensity: input.exteriorFillIntensity,
    exteriorDirIntensity: input.exteriorDirIntensity,
    interiorBounceScale: input.interiorBounceScale,
  });

  return interior01;
}

export function mountMammothApartmentInteriorBounceRig(
  scene: THREE.Scene,
  namePrefix: string,
): MammothApartmentInteriorBounceRig {
  const bounce = APARTMENT_INTERIOR_VISUAL_PROFILE.interiorBounce;
  const bounceHemi = new THREE.HemisphereLight(bounce.hemiSky, bounce.hemiGround, 0);
  bounceHemi.name = `${namePrefix}_bounce_hemi`;
  const bounceFill = new THREE.AmbientLight(bounce.fill, 0);
  bounceFill.name = `${namePrefix}_bounce_fill`;
  const bounceDir = new THREE.DirectionalLight(bounce.dir, 0);
  bounceDir.name = `${namePrefix}_bounce_dir`;
  bounceDir.position.copy(INTERIOR_BOUNCE_DIR_POSITION);
  bounceDir.castShadow = false;
  for (const light of [bounceHemi, bounceFill, bounceDir]) {
    applyMammothApartmentInteriorLightLayers(light);
  }
  scene.add(bounceHemi, bounceFill, bounceDir);
  return { bounceHemi, bounceFill, bounceDir };
}

export function mountMammothApartmentInteriorSceneRig(
  scene: THREE.Scene,
  namePrefix: string,
): MammothApartmentInteriorSceneRigMount {
  const bounce = mountMammothApartmentInteriorBounceRig(scene, namePrefix);
  return {
    ...bounce,
    dispose: () => {
      scene.remove(bounce.bounceHemi, bounce.bounceFill, bounce.bounceDir);
      bounce.bounceHemi.dispose();
      bounce.bounceFill.dispose();
      bounce.bounceDir.dispose();
    },
  };
}

export function applyMammothApartmentInteriorLightLayersToGlobalRig(
  rig: MammothApartmentInteriorGlobalRig,
): void {
  applyMammothApartmentInteriorLightLayers(rig.hemi);
  applyMammothApartmentInteriorLightLayers(rig.fill);
  applyMammothApartmentInteriorLightLayers(rig.dir);
}

/** Shared PMREM attach — decor uses neutral readable env; shells prefer warm interior env. */
export function syncMammothApartmentInteriorMetallicEnv(input: {
  scene: THREE.Scene;
  envTexture: THREE.Texture | null;
  shellEnvTexture?: THREE.Texture | null;
  decorRoots: readonly THREE.Object3D[];
  shellRoots: readonly THREE.Object3D[];
}): void {
  if (input.envTexture) {
    input.scene.userData.mammothFpMetallicReadableEnv = input.envTexture;
  } else {
    delete input.scene.userData.mammothFpMetallicReadableEnv;
  }
  const shellEnv =
    input.shellEnvTexture ??
    apartmentInteriorShellWarmEnvFromScene(input.scene) ??
    input.envTexture;
  if (shellEnv) {
    input.scene.userData[MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD] = shellEnv;
  } else {
    delete input.scene.userData[MAMMOTH_APARTMENT_SHELL_WARM_ENV_UD];
  }
  for (const root of input.decorRoots) {
    bindMammothApartmentPropReadableEnv(root, input.envTexture);
  }
  for (const root of input.shellRoots) {
    bindMammothResidentialShellIndirectEnv(root, shellEnv);
  }
}

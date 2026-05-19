import * as THREE from "three";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

/** Keep in sync with FP session layer indices and practical-light masks. */
const APARTMENT_INTERIOR_PREVIEW_LIGHT_LAYER_MASK =
  (1 << 0) | (1 << 3) | (1 << 5);

/** Dark void — matches in-game interior corners; not the orbit editor's light-gray studio. */
export const APARTMENT_INTERIOR_PREVIEW_BACKGROUND = 0x121110;

export type ApartmentInteriorPreviewSceneLightingMount = {
  bounceHemi: THREE.HemisphereLight;
  bounceFill: THREE.AmbientLight;
  dispose: () => void;
};

/**
 * Secondary fill rig for apartment layout preview — matches FP residential bounce while keeping the
 * shared editor sun rig at {@link APARTMENT_INTERIOR_VISUAL_PROFILE.interiorAmbient} (zero).
 */
export function mountApartmentInteriorPreviewSceneLighting(
  scene: THREE.Scene,
): ApartmentInteriorPreviewSceneLightingMount {
  const bounce = APARTMENT_INTERIOR_VISUAL_PROFILE.interiorBounce;
  const bounceHemi = new THREE.HemisphereLight(
    bounce.hemiSky,
    bounce.hemiGround,
    0,
  );
  bounceHemi.name = "apartment_interior_preview_bounce_hemi";
  bounceHemi.layers.mask = APARTMENT_INTERIOR_PREVIEW_LIGHT_LAYER_MASK;
  const bounceFill = new THREE.AmbientLight(bounce.fill, 0);
  bounceFill.name = "apartment_interior_preview_bounce_fill";
  bounceFill.layers.mask = APARTMENT_INTERIOR_PREVIEW_LIGHT_LAYER_MASK;
  scene.add(bounceHemi, bounceFill);
  return {
    bounceHemi,
    bounceFill,
    dispose: () => {
      scene.remove(bounceHemi, bounceFill);
      bounceHemi.dispose();
      bounceFill.dispose();
    },
  };
}

export function syncApartmentInteriorPreviewSceneLighting(input: {
  active: boolean;
  renderer: THREE.WebGPURenderer;
  sharedHemi: THREE.HemisphereLight;
  sharedFill: THREE.AmbientLight;
  sharedDir: THREE.DirectionalLight;
  bounceHemi: THREE.HemisphereLight;
  bounceFill: THREE.AmbientLight;
}): void {
  const ambient = APARTMENT_INTERIOR_VISUAL_PROFILE.interiorAmbient;
  const bounce = APARTMENT_INTERIOR_VISUAL_PROFILE.interiorBounce;
  const exposure = APARTMENT_INTERIOR_VISUAL_PROFILE.exposure;

  if (!input.active) {
    input.bounceHemi.intensity = 0;
    input.bounceFill.intensity = 0;
    return;
  }

  input.renderer.toneMappingExposure = exposure.interior;
  input.sharedHemi.color.setHex(ambient.hemiSky);
  input.sharedHemi.groundColor.setHex(ambient.hemiGround);
  input.sharedHemi.intensity = ambient.hemiIntensity;
  input.sharedFill.color.setHex(ambient.fill);
  input.sharedFill.intensity = ambient.fillIntensity;
  input.sharedDir.intensity = ambient.dirIntensity;

  input.bounceHemi.color.setHex(bounce.hemiSky);
  input.bounceHemi.groundColor.setHex(bounce.hemiGround);
  input.bounceHemi.intensity = bounce.hemiIntensity;
  input.bounceFill.color.setHex(bounce.fill);
  input.bounceFill.intensity = bounce.fillIntensity;
}

export type ApartmentInteriorPreviewSceneAtmosphereRestore = {
  background: THREE.Color;
  fog: THREE.Fog | THREE.FogExp2 | null;
};

export function captureApartmentInteriorPreviewSceneAtmosphere(
  scene: THREE.Scene,
): ApartmentInteriorPreviewSceneAtmosphereRestore {
  const bg =
    scene.background instanceof THREE.Color
      ? scene.background.clone()
      : new THREE.Color(0xe8edf4);
  return { background: bg, fog: scene.fog };
}

/** Drop bright studio fog/background so layout preview reads like the FP flat, not the orbit slab. */
export function syncApartmentInteriorPreviewSceneAtmosphere(
  scene: THREE.Scene,
  active: boolean,
  restore: ApartmentInteriorPreviewSceneAtmosphereRestore,
): void {
  if (active) {
    scene.background = new THREE.Color(APARTMENT_INTERIOR_PREVIEW_BACKGROUND);
    scene.fog = null;
    return;
  }
  scene.background = restore.background.clone();
  scene.fog = restore.fog;
}

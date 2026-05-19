import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyMammothApartmentInteriorScene,
  mountMammothApartmentInteriorSceneRig,
} from "./apartmentInteriorSceneLighting.js";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

describe("applyMammothApartmentInteriorScene", () => {
  it("matches editor full-flat state at interiorProximity01 = 1", () => {
    const scene = new THREE.Scene();
    const renderer = { toneMappingExposure: 1 } as THREE.WebGPURenderer;
    const sharedHemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    const sharedFill = new THREE.AmbientLight(0xffffff, 1);
    const sharedDir = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(sharedHemi, sharedFill, sharedDir);
    const rig = mountMammothApartmentInteriorSceneRig(scene, "test");

    const interior01 = applyMammothApartmentInteriorScene({
      scene,
      renderer,
      interiorProximity01: 1,
      bounce: rig,
      global: { hemi: sharedHemi, fill: sharedFill, dir: sharedDir },
    });

    const { interiorBounce, exposure, scene: sceneCfg } =
      APARTMENT_INTERIOR_VISUAL_PROFILE;
    expect(interior01).toBe(1);
    expect(renderer.toneMappingExposure).toBe(exposure.interior);
    expect(sharedHemi.intensity).toBe(0);
    expect(sharedFill.intensity).toBe(0);
    expect(sharedDir.intensity).toBe(0);
    expect(rig.bounceHemi.intensity).toBe(interiorBounce.hemiIntensity);
    expect(rig.bounceFill.intensity).toBe(interiorBounce.fillIntensity);
    expect(rig.bounceDir.intensity).toBe(interiorBounce.dirIntensity);
    expect((scene.background as THREE.Color).getHex()).toBe(sceneCfg.background);
    expect(rig.bounceHemi.groundColor.getHex()).toBe(rig.bounceHemi.color.getHex());

    rig.dispose();
  });
});

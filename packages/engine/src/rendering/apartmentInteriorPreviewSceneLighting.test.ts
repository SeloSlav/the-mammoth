import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  mountApartmentInteriorPreviewSceneLighting,
  syncApartmentInteriorPreviewSceneLighting,
} from "./apartmentInteriorPreviewSceneLighting.js";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

describe("syncApartmentInteriorPreviewSceneLighting", () => {
  it("zeros the shared rig and enables bounce lights when active", () => {
    const scene = new THREE.Scene();
    const renderer = { toneMappingExposure: 1 } as THREE.WebGPURenderer;
    const sharedHemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    const sharedFill = new THREE.AmbientLight(0xffffff, 1);
    const sharedDir = new THREE.DirectionalLight(0xffffff, 1);
    const mount = mountApartmentInteriorPreviewSceneLighting(scene);

    syncApartmentInteriorPreviewSceneLighting({
      active: true,
      renderer,
      sharedHemi,
      sharedFill,
      sharedDir,
      bounceHemi: mount.bounceHemi,
      bounceFill: mount.bounceFill,
    });

    expect(renderer.toneMappingExposure).toBe(
      APARTMENT_INTERIOR_VISUAL_PROFILE.exposure.interior,
    );
    expect(sharedHemi.intensity).toBe(0);
    expect(sharedFill.intensity).toBe(0);
    expect(sharedDir.intensity).toBe(0);
    expect(mount.bounceHemi.intensity).toBe(
      APARTMENT_INTERIOR_VISUAL_PROFILE.interiorBounce.hemiIntensity,
    );
    expect(mount.bounceFill.intensity).toBe(
      APARTMENT_INTERIOR_VISUAL_PROFILE.interiorBounce.fillIntensity,
    );

    mount.dispose();
  });
});

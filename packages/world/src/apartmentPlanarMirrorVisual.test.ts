import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  APARTMENT_MIRROR_SURFACE_USERDATA_KEY,
  buildApartmentPlanarMirrorVisual,
} from "./apartmentPlanarMirrorVisual.js";

describe("buildApartmentPlanarMirrorVisual", () => {
  it("tags the reflective plane for FP mirror registration", () => {
    const root = buildApartmentPlanarMirrorVisual({ widthM: 0.8, heightM: 1.2 });
    let surface: THREE.Mesh | null = null;
    root.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.userData[APARTMENT_MIRROR_SURFACE_USERDATA_KEY] === true
      ) {
        surface = obj;
      }
    });
    expect(surface).not.toBeNull();
    expect(surface!.userData.mammothCabMirror).toBe(true);
    expect(surface!.scale.x).toBeCloseTo(0.8);
    expect(surface!.scale.y).toBeCloseTo(1.2);
  });
});

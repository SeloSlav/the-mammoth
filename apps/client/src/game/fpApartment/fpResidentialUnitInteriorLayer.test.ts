import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  APARTMENT_MIRROR_SURFACE_USERDATA_KEY,
  buildApartmentPlanarMirrorVisual,
  MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY,
} from "@the-mammoth/world";
import { FP_APARTMENT_DECOR_PROP_LAYER, FP_RESIDENTIAL_UNIT_INTERIOR_LAYER } from "../fpSession/fpSessionConstants.js";
import {
  tagApartmentDecorPropMeshesForMirrorExclusion,
  tagResidentialUnitInteriorMeshesUnder,
} from "./fpResidentialUnitInteriorLayer.js";

describe("tagApartmentDecorPropMeshesForMirrorExclusion", () => {
  it("moves decor props to layer 5 but keeps mirror glass on layer 3", () => {
    const root = new THREE.Group();
    root.userData.mammothApartmentDecorProp = true;

    const chair = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    chair.userData.mammothApartmentDecorProp = true;
    root.add(chair);

    const mirrorVisual = buildApartmentPlanarMirrorVisual({
      widthM: 0.72,
      heightM: 1.28,
      includeFrame: false,
    });
    root.add(mirrorVisual);

    tagResidentialUnitInteriorMeshesUnder(root);
    tagApartmentDecorPropMeshesForMirrorExclusion(root);

    expect(chair.layers.mask).toBe(1 << FP_APARTMENT_DECOR_PROP_LAYER);

    const surface = mirrorVisual.getObjectByName("apartment_mirror_surface") as THREE.Mesh;
    expect(surface.userData[MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY]).toBe(true);
    expect(surface.userData[APARTMENT_MIRROR_SURFACE_USERDATA_KEY]).toBe(true);
    expect(surface.layers.mask).toBe(1 << FP_RESIDENTIAL_UNIT_INTERIOR_LAYER);
  });
});

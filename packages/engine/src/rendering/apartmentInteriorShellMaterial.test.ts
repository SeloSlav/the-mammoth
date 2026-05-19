import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { prepareApartmentInteriorShellMaterial } from "./apartmentDecorMoodGrade.js";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

describe("prepareApartmentInteriorShellMaterial", () => {
  it("clones shared shell materials and adds subtle plaster emissive", () => {
    const shared = new THREE.MeshStandardMaterial({
      color: 0xe6e0d8,
      roughness: 1,
    });
    const a = prepareApartmentInteriorShellMaterial(shared);
    const b = prepareApartmentInteriorShellMaterial(shared);

    expect(a).not.toBe(shared);
    expect(b).not.toBe(a);
    expect(a.emissiveIntensity).toBe(
      APARTMENT_INTERIOR_VISUAL_PROFILE.shell.shadowEmissiveIntensity,
    );
    expect(a.roughness).toBe(APARTMENT_INTERIOR_VISUAL_PROFILE.shell.maxRoughness);
    expect(shared.emissiveIntensity).not.toBe(a.emissiveIntensity);
  });
});

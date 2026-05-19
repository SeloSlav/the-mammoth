import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  attachApartmentDecorContactShadow,
  disposeLeakedApartmentDecorContactShadows,
} from "./apartmentInteriorContactShadow.js";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

describe("apartmentInteriorContactShadow", () => {
  it("does not attach shadows while contactShadow.enabled is false", () => {
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial(),
      ),
    );
    expect(attachApartmentDecorContactShadow(root, 0)).toBeNull();
    expect(root.getObjectByName("apartment_decor_contact_shadow")).toBeUndefined();
    expect(APARTMENT_INTERIOR_VISUAL_PROFILE.contactShadow.enabled).toBe(false);
  });

  it("disposeLeakedApartmentDecorContactShadows removes orphan shadow meshes", () => {
    const scene = new THREE.Group();
    const leak = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 8),
      new THREE.MeshBasicMaterial(),
    );
    leak.name = "apartment_decor_contact_shadow";
    scene.add(leak);
    disposeLeakedApartmentDecorContactShadows(scene);
    expect(scene.children.length).toBe(0);
  });
});

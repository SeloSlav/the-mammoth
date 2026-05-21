import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  disposeLeakedApartmentDecorContactShadows,
  syncApartmentDecorBatchedContactShadows,
} from "./apartmentInteriorContactShadow.js";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

function decorGroupWithBox(modelRelPath: string): THREE.Group {
  const root = new THREE.Group();
  root.userData.mammothApartmentDecorModelRelPath = modelRelPath;
  root.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    ),
  );
  return root;
}

describe("apartmentInteriorContactShadow", () => {
  it("does not create batched blobs while contactShadow is disabled", () => {
    expect(APARTMENT_INTERIOR_VISUAL_PROFILE.contactShadow.enabled).toBe(false);

    const parent = new THREE.Group();
    const mount = syncApartmentDecorBatchedContactShadows({
      parent,
      decorGroups: [decorGroupWithBox("static/models/objects/coffee-table.glb")],
    });
    expect(mount).toBeNull();
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

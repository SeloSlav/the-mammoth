import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyApartmentDecorCastShadowFlags,
  applyApartmentInteriorFloorReceiveShadowUnder,
  isApartmentInteriorFloorShellMesh,
  syncApartmentDecorShadowRig,
} from "./apartmentInteriorDecorShadow.js";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";

describe("apartmentInteriorDecorShadow", () => {
  it("marks eligible decor meshes as shadow casters and receivers", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    root.add(mesh);

    applyApartmentDecorCastShadowFlags(root, "static/models/objects/coffee-table.glb");
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);

    applyApartmentDecorCastShadowFlags(root, "static/models/objects/rug.glb");
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);

    applyApartmentDecorCastShadowFlags(root, "static/models/objects/kelp.glb");
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
  });

  it("enables receiveShadow on shell floor meshes", () => {
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.1, 2),
      new THREE.MeshStandardMaterial(),
    );
    floor.name = "shell_floor_0";
    expect(isApartmentInteriorFloorShellMesh(floor)).toBe(true);

    const root = new THREE.Group();
    root.add(floor);
    applyApartmentInteriorFloorReceiveShadowUnder(root);
    expect(floor.receiveShadow).toBe(true);
  });

  it("skips realtime directional light when baked floor overlay is primary", () => {
    expect(APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.bakedFloorOverlay).toBe(true);
    expect(APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.realtimeShadowMap).toBe(false);

    const parent = new THREE.Group();
    const decor = new THREE.Group();
    decor.userData.mammothApartmentDecorModelRelPath = "static/models/objects/coffee-table.glb";
    decor.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial(),
      ),
    );
    parent.add(decor);

    const mount = syncApartmentDecorShadowRig({
      lightParent: parent,
      decorGroups: [decor],
    });

    expect(mount).toBeNull();
    expect(parent.children.some((ch) => ch.name === "apartment_decor_shadow_light")).toBe(false);
  });
});

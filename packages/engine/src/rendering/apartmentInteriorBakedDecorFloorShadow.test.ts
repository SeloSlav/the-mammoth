import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { syncApartmentDecorBakedFloorShadowOverlay } from "./apartmentInteriorBakedDecorFloorShadow.js";

describe("apartmentInteriorBakedDecorFloorShadow", () => {
  it("creates a merged floor-hugging shadow mesh for eligible decor", () => {
    const parent = new THREE.Group();
    const decor = new THREE.Group();
    decor.userData.mammothApartmentDecorModelRelPath =
      "static/models/objects/table-dining.glb";
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.75, 0.8),
      new THREE.MeshStandardMaterial(),
    );
    table.position.y = 0.375;
    decor.add(table);
    parent.add(decor);

    const mount = syncApartmentDecorBakedFloorShadowOverlay({
      renderer: {} as THREE.WebGPURenderer,
      parent,
      decorGroups: [decor],
      floorWorldY: 0.024,
    });

    expect(mount).not.toBeNull();
    expect(mount!.overlay.name).toBe("apartment_decor_baked_floor_shadow");
    expect(parent.children).toContain(mount!.overlay);

    const pos = mount!.overlay.geometry.getAttribute("position");
    expect(pos).toBeDefined();
    for (let i = 0; i < pos!.count; i++) {
      expect(pos!.getY(i)).toBeCloseTo(0.024, 4);
    }

    mount!.dispose();
    expect(parent.children).not.toContain(mount!.overlay);
  });

  it("projects decor shadows onto the decor support height for rug receivers", () => {
    const parent = new THREE.Group();
    const decor = new THREE.Group();
    decor.userData.mammothApartmentDecorModelRelPath =
      "static/models/objects/sofa.glb";
    const sofa = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.9, 0.75),
      new THREE.MeshStandardMaterial(),
    );
    sofa.position.y = 0.48;
    decor.add(sofa);
    parent.add(decor);

    const mount = syncApartmentDecorBakedFloorShadowOverlay({
      renderer: {} as THREE.WebGPURenderer,
      parent,
      decorGroups: [decor],
      floorWorldY: 0.024,
    });

    expect(mount).not.toBeNull();
    const pos = mount!.overlay.geometry.getAttribute("position");
    expect(pos).toBeDefined();
    for (let i = 0; i < pos!.count; i++) {
      expect(pos!.getY(i)).toBeCloseTo(0.034, 4);
    }
    expect(mount!.softOverlay).toBeDefined();
    expect(mount!.softOverlays).toHaveLength(5);

    mount!.dispose();
  });

  it("skips rugs, light fixtures, and wall-mounted decor", () => {
    const parent = new THREE.Group();
    for (const modelRelPath of [
      "static/models/objects/rug.glb",
      "static/models/objects/light-ceiling.glb",
      "static/models/objects/wall-clock.glb",
      "static/models/objects/painting-knitted.glb",
      "static/models/objects/coat-hanger-2.glb",
    ]) {
      const decor = new THREE.Group();
      decor.userData.mammothApartmentDecorModelRelPath = modelRelPath;
      decor.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(2, 0.02, 3),
          new THREE.MeshStandardMaterial(),
        ),
      );
      parent.add(decor);

      const mount = syncApartmentDecorBakedFloorShadowOverlay({
        renderer: {} as THREE.WebGPURenderer,
        parent,
        decorGroups: [decor],
        floorWorldY: 0.024,
      });

      expect(mount).toBeNull();
      decor.removeFromParent();
    }
  });
});

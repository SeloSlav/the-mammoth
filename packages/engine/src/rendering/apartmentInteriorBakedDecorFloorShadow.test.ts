import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { syncApartmentDecorBakedFloorShadowOverlay } from "./apartmentInteriorBakedDecorFloorShadow.js";
import { apartmentDecorBakedFloorShadowHullScale } from "./apartmentInteriorVisualProfile.js";

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

  it("snaps elevated sink and water tank shadows onto the shell floor", () => {
    const floorWorldY = 0.024;
    for (const modelRelPath of [
      "static/models/objects/sink.glb",
      "static/models/objects/water-tank.glb",
    ]) {
      const parent = new THREE.Group();
      const decor = new THREE.Group();
      decor.userData.mammothApartmentDecorModelRelPath = modelRelPath;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.6, 0.4),
        new THREE.MeshStandardMaterial(),
      );
      mesh.position.y = 1.2;
      decor.add(mesh);
      parent.add(decor);

      const mount = syncApartmentDecorBakedFloorShadowOverlay({
        renderer: {} as THREE.WebGPURenderer,
        parent,
        decorGroups: [decor],
        floorWorldY,
      });

      expect(mount).not.toBeNull();
      const pos = mount!.overlay.geometry.getAttribute("position");
      for (let i = 0; i < pos!.count; i++) {
        expect(pos!.getY(i)).toBeCloseTo(floorWorldY, 4);
      }
      mount!.dispose();
    }
  });

  it("keeps compact hull scale near 1 for tiny world footprints", () => {
    const tiny = new THREE.Vector3(0.04, 0.03, 0.05);
    for (const modelRelPath of [
      "static/models/objects/ashtray.glb",
      "static/models/objects/rakija.glb",
      "static/models/objects/cigarette-pack.glb",
    ]) {
      expect(
        apartmentDecorBakedFloorShadowHullScale(modelRelPath, tiny),
      ).toBeGreaterThan(0.92);
    }

    for (const modelRelPath of [
      "static/models/objects/cigarette.glb",
      "static/models/objects/used-cigarette.glb",
      "static/models/objects/used-cigarette-2.glb",
    ]) {
      expect(
        apartmentDecorBakedFloorShadowHullScale(modelRelPath, tiny),
      ).toBeLessThan(0.7);
      expect(
        apartmentDecorBakedFloorShadowHullScale(modelRelPath, tiny),
      ).toBeGreaterThan(0.45);
    }

    const wide = new THREE.Vector3(0.2, 0.08, 0.18);
    expect(
      apartmentDecorBakedFloorShadowHullScale(
        "static/models/objects/ashtray.glb",
        wide,
      ),
    ).toBeLessThan(0.85);
  });

  it("tightens compact prop shadows more when the placed instance reads large", () => {
    const floorWorldY = 0.024;
    const hullSpan = (mount: NonNullable<
      ReturnType<typeof syncApartmentDecorBakedFloorShadowOverlay>
    >): number => {
      const pos = mount.overlay.geometry.getAttribute("position");
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      return Math.max(maxX - minX, maxZ - minZ);
    };

    const parent = new THREE.Group();
    const makeAshtray = (uniformScale: number): THREE.Group => {
      const decor = new THREE.Group();
      decor.userData.mammothApartmentDecorModelRelPath =
        "static/models/objects/ashtray.glb";
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.28, 0.18),
        new THREE.MeshStandardMaterial(),
      );
      mesh.scale.setScalar(uniformScale);
      decor.add(mesh);
      return decor;
    };

    const tinyDecor = makeAshtray(0.12);
    parent.add(tinyDecor);
    const tinyMount = syncApartmentDecorBakedFloorShadowOverlay({
      renderer: {} as THREE.WebGPURenderer,
      parent,
      decorGroups: [tinyDecor],
      floorWorldY,
    });
    expect(tinyMount).not.toBeNull();
    const tinySpan = hullSpan(tinyMount!);
    tinyMount!.dispose();
    tinyDecor.removeFromParent();

    const largeDecor = makeAshtray(1);
    parent.add(largeDecor);
    const largeMount = syncApartmentDecorBakedFloorShadowOverlay({
      renderer: {} as THREE.WebGPURenderer,
      parent,
      decorGroups: [largeDecor],
      floorWorldY,
    });
    expect(largeMount).not.toBeNull();
    const largeSpan = hullSpan(largeMount!);
    largeMount!.dispose();

    expect(largeSpan).toBeGreaterThan(tinySpan * 2.5);
    expect(tinySpan / 0.12).toBeGreaterThan(largeSpan * 0.55);
  });

  it("uses a smaller hull scale for loose cigarettes than cigarette packs", () => {
    const tiny = new THREE.Vector3(0.02, 0.01, 0.015);
    const packScale = apartmentDecorBakedFloorShadowHullScale(
      "static/models/objects/cigarette-pack.glb",
      tiny,
    );
    const looseScale = apartmentDecorBakedFloorShadowHullScale(
      "static/models/objects/cigarette.glb",
      tiny,
    );
    expect(looseScale).toBeLessThan(packScale * 0.85);
  });

  it("bakes footprint-scaled shadows for cigarette packs and cigarettes", () => {
    const parent = new THREE.Group();
    for (const { modelRelPath, boxSize, uniformScale } of [
      {
        modelRelPath: "static/models/objects/cigarette-pack.glb",
        boxSize: [0.08, 0.02, 0.05] as const,
        uniformScale: 0.1,
      },
      {
        modelRelPath: "static/models/objects/empty-cigarette-pack.glb",
        boxSize: [0.08, 0.02, 0.05] as const,
        uniformScale: 0.1,
      },
      {
        modelRelPath: "static/models/objects/cigarette.glb",
        boxSize: [0.08, 0.02, 0.05] as const,
        uniformScale: 0.05,
      },
      {
        modelRelPath: "static/models/objects/used-cigarette.glb",
        boxSize: [0.08, 0.02, 0.05] as const,
        uniformScale: 0.04,
      },
    ]) {
      const decor = new THREE.Group();
      decor.userData.mammothApartmentDecorModelRelPath = modelRelPath;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...boxSize),
        new THREE.MeshStandardMaterial(),
      );
      mesh.scale.setScalar(uniformScale);
      decor.add(mesh);
      parent.add(decor);

      const mount = syncApartmentDecorBakedFloorShadowOverlay({
        renderer: {} as THREE.WebGPURenderer,
        parent,
        decorGroups: [decor],
        floorWorldY: 0.024,
      });

      expect(mount).not.toBeNull();
      mount!.dispose();
      decor.removeFromParent();
    }
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
      expect(pos!.getY(i)).toBeCloseTo(0.042, 4);
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

  it("keeps screen emitters eligible for grounded baked shadows", () => {
    const parent = new THREE.Group();
    const decor = new THREE.Group();
    decor.userData.mammothApartmentDecorModelRelPath =
      "static/models/objects/tv.glb";
    decor.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.7, 0.45),
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

    expect(mount).not.toBeNull();
    mount!.dispose();
  });

  it("bakes simplified top-down hulls instead of flattening source triangle counts", () => {
    const parent = new THREE.Group();
    const decor = new THREE.Group();
    decor.userData.mammothApartmentDecorModelRelPath =
      "static/models/objects/sofa.glb";
    const source = new THREE.SphereGeometry(0.65, 96, 48);
    const mesh = new THREE.Mesh(source, new THREE.MeshStandardMaterial());
    mesh.scale.set(1.8, 0.35, 0.9);
    mesh.position.y = 0.4;
    decor.add(mesh);
    parent.add(decor);

    const mount = syncApartmentDecorBakedFloorShadowOverlay({
      renderer: {} as THREE.WebGPURenderer,
      parent,
      decorGroups: [decor],
      floorWorldY: 0.024,
    });

    expect(mount).not.toBeNull();
    const sourceTriangleCount = source.index
      ? source.index.count / 3
      : source.getAttribute("position").count / 3;
    const bakedTriangleCount =
      mount!.overlay.geometry.getAttribute("position").count / 3;
    expect(bakedTriangleCount).toBeLessThan(sourceTriangleCount / 8);
    expect(bakedTriangleCount).toBeLessThanOrEqual(96);
    mount!.dispose();
  });
});
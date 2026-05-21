import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { apartmentDecorEmitterKindFromModelPath } from "./apartmentInteriorVisualProfile.js";
import {
  apartmentPracticalLightSpecFromDecorGroup,
  apartmentPracticalLightSpecFromWindowGlassMesh,
  mountApartmentPracticalLights,
} from "./apartmentInteriorPracticalLights.js";

describe("apartmentDecorEmitterKindFromModelPath", () => {
  it("detects chandelier, ceiling, standing lamp, TV, and computer fixtures", () => {
    expect(
      apartmentDecorEmitterKindFromModelPath("static/models/objects/chandelier.glb"),
    ).toBe("chandelier");
    expect(
      apartmentDecorEmitterKindFromModelPath("static/models/objects/light-ceiling.glb"),
    ).toBe("ceiling");
    expect(
      apartmentDecorEmitterKindFromModelPath("static/models/objects/lamp-standing.glb"),
    ).toBe("standing");
    expect(
      apartmentDecorEmitterKindFromModelPath("static/models/objects/tv.glb"),
    ).toBe("tv");
    expect(
      apartmentDecorEmitterKindFromModelPath("static/models/objects/computer.glb"),
    ).toBe("computer");
    expect(
      apartmentDecorEmitterKindFromModelPath("static/models/objects/chair.glb"),
    ).toBeNull();
  });
});

describe("apartmentPracticalLightSpecFromDecorGroup", () => {
  it("places standing-lamp light inside the upper shade band, inset into the room, aiming down", () => {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.0, 0.08),
      new THREE.MeshBasicMaterial(),
    );
    pole.position.y = 0.5;
    const shade = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshBasicMaterial(),
    );
    shade.position.y = 1.18;
    group.add(pole, shade);
    group.updateMatrixWorld(true);

    const spec = apartmentPracticalLightSpecFromDecorGroup(
      group,
      "static/models/objects/lamp-standing.glb",
    );
    expect(spec?.kind).toBe("standing");
    expect(spec!.position.y).toBeGreaterThan(1.05);
    expect(spec!.position.y).toBeLessThan(1.25);
    expect(spec?.direction).toBeUndefined();
  });

  it("places ceiling-lamp light at fixture bottom and aims downward", () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.12, 0.4),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.y = 2.4;
    group.add(mesh);
    group.updateMatrixWorld(true);

    const spec = apartmentPracticalLightSpecFromDecorGroup(
      group,
      "static/models/objects/light-ceiling.glb",
    );
    expect(spec?.kind).toBe("ceiling");
    expect(spec!.position.x).toBeCloseTo(0, 5);
    expect(spec!.position.z).toBeCloseTo(0, 5);
    expect(spec!.position.y).toBeCloseTo(2.4, 3);
    expect(spec!.direction!.y).toBeLessThan(-0.99);
  });

  it("emits a flattened horizontal blue-TV wash from screen forward", () => {
    const group = new THREE.Group();
    group.rotation.y = Math.PI / 2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.55, 0.08),
      new THREE.MeshBasicMaterial(),
    );
    group.add(mesh);
    group.updateMatrixWorld(true);

    const spec = apartmentPracticalLightSpecFromDecorGroup(
      group,
      "static/models/objects/tv.glb",
    );
    expect(spec?.kind).toBe("tv");
    expect(spec?.direction).toBeDefined();
    expect(Math.abs(spec!.direction!.y)).toBeLessThan(0.01);
    expect(Math.abs(spec!.direction!.x)).toBeGreaterThan(0.9);
  });

  it("emits a blue monitor wash from the computer screen forward", () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.42, 0.06),
      new THREE.MeshBasicMaterial(),
    );
    group.add(mesh);
    group.updateMatrixWorld(true);

    const spec = apartmentPracticalLightSpecFromDecorGroup(
      group,
      "static/models/objects/computer.glb",
    );
    expect(spec?.kind).toBe("computer");
    expect(spec?.direction).toBeDefined();
    expect(Math.abs(spec!.direction!.z)).toBeGreaterThan(0.9);
  });
});

describe("mountApartmentPracticalLights", () => {
  it("stores world spec positions in parent-local space", () => {
    const parent = new THREE.Group();
    parent.position.set(10, 0, 20);
    parent.updateMatrixWorld(true);

    const mount = mountApartmentPracticalLights(parent, [
      {
        kind: "chandelier",
        position: new THREE.Vector3(12, 2.5, 22),
      },
    ]);

    const point = mount.root.children[0] as THREE.PointLight;
    expect(point.position.x).toBeCloseTo(2, 5);
    expect(point.position.y).toBeCloseTo(2.5, 5);
    expect(point.position.z).toBeCloseTo(2, 5);

    mount.dispose();
  });

  it("mounts standing as omni point and ceiling as downward spot", () => {
    const parent = new THREE.Group();
    parent.updateMatrixWorld(true);

    const mount = mountApartmentPracticalLights(parent, [
      {
        kind: "standing",
        position: new THREE.Vector3(1, 1.5, 2),
      },
      {
        kind: "ceiling",
        position: new THREE.Vector3(3, 2.6, 2),
        direction: new THREE.Vector3(0, -1, 0),
      },
    ]);

    expect(mount.root.children).toHaveLength(4);
    const standing = mount.root.children[0] as THREE.PointLight;
    const ceiling = mount.root.children[1] as THREE.SpotLight;
    const ceilingWash = mount.root.children[3] as THREE.PointLight;
    expect(standing.isPointLight).toBe(true);
    expect(ceiling.isSpotLight).toBe(true);
    expect(ceilingWash.isPointLight).toBe(true);
    expect(ceilingWash.name).toBe("apt_ceiling_wash_1");

    mount.dispose();
  });
});

describe("apartmentPracticalLightSpecFromWindowGlassMesh", () => {
  it("derives an inward world direction from glass mesh name", () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.5, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.name = "unit_exterior_glass_e_0";
    mesh.position.set(4, 1.2, 0);
    mesh.updateMatrixWorld(true);

    const spec = apartmentPracticalLightSpecFromWindowGlassMesh(mesh);
    expect(spec?.kind).toBe("window");
    expect(spec?.direction).toBeDefined();
    expect(spec!.direction!.x).toBeLessThan(-0.5);
  });
});

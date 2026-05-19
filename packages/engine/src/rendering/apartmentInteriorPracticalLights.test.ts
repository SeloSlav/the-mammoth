import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { apartmentDecorEmitterKindFromModelPath } from "./apartmentInteriorVisualProfile.js";
import {
  apartmentPracticalLightSpecFromDecorGroup,
  apartmentPracticalLightSpecFromWindowGlassMesh,
} from "./apartmentInteriorPracticalLights.js";

describe("apartmentDecorEmitterKindFromModelPath", () => {
  it("detects chandelier, ceiling, and TV fixtures", () => {
    expect(
      apartmentDecorEmitterKindFromModelPath("static/models/objects/chandelier.glb"),
    ).toBe("chandelier");
    expect(
      apartmentDecorEmitterKindFromModelPath("static/models/objects/light-ceiling.glb"),
    ).toBe("ceiling");
    expect(
      apartmentDecorEmitterKindFromModelPath("static/models/objects/tv.glb"),
    ).toBe("tv");
    expect(
      apartmentDecorEmitterKindFromModelPath("static/models/objects/chair.glb"),
    ).toBeNull();
  });
});

describe("apartmentPracticalLightSpecFromDecorGroup", () => {
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

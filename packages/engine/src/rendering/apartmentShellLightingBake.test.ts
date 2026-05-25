import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  hashApartmentShellLightingLayout,
  apartmentShellLightingLayoutHashInput,
} from "./apartmentShellLightingLayoutHash.js";
import { evaluateApartmentShellLightingAtPoint } from "./apartmentShellLightingEvaluate.js";
import { bakeApartmentShellMeshLightmap } from "./apartmentShellBakedLighting.js";

describe("apartmentShellLightingLayoutHash", () => {
  it("is stable for identical layout input", () => {
    const input = apartmentShellLightingLayoutHashInput({
      unitKey: "floor|20|unit_a",
      items: [
        {
          modelRelPath: "static/models/objects/light-ceiling.glb",
          x: 1,
          y: 2.4,
          z: -0.5,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
        },
      ],
    });
    expect(hashApartmentShellLightingLayout(input)).toBe(
      hashApartmentShellLightingLayout(input),
    );
  });

  it("changes when decor pose changes", () => {
    const base = apartmentShellLightingLayoutHashInput({
      unitKey: "floor|20|unit_a",
      items: [
        {
          modelRelPath: "static/models/objects/light-ceiling.glb",
          x: 1,
          y: 2.4,
          z: -0.5,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
        },
      ],
    });
    const moved = apartmentShellLightingLayoutHashInput({
      unitKey: "floor|20|unit_a",
      items: [
        {
          modelRelPath: "static/models/objects/light-ceiling.glb",
          x: 1.2,
          y: 2.4,
          z: -0.5,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
        },
      ],
    });
    expect(hashApartmentShellLightingLayout(base)).not.toBe(
      hashApartmentShellLightingLayout(moved),
    );
  });
});

describe("bakeApartmentShellMeshLightmap", () => {
  it("writes non-zero irradiance under a ceiling spot", () => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshStandardMaterial(),
    );
    mesh.name = "shell_floor";
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData.mammothUnitInterior = true;
    mesh.userData.mammothPlacedObjectId = "unit_e_003";
    mesh.updateMatrixWorld(true);

    const specs = [
      {
        kind: "ceiling" as const,
        position: new THREE.Vector3(0, 2.5, 0),
        direction: new THREE.Vector3(0, -1, 0),
      },
    ];

    const tex = bakeApartmentShellMeshLightmap(mesh, specs, 32);
    expect(tex).not.toBeNull();
    const data = tex!.image.data as Float32Array;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      max = Math.max(max, data[i]!, data[i + 1]!, data[i + 2]!);
    }
    expect(max).toBeGreaterThan(0.01);
    tex!.dispose();
  });
});

describe("evaluateApartmentShellLightingAtPoint", () => {
  it("returns brighter results nearer a point light", () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const near = evaluateApartmentShellLightingAtPoint({
      worldPos: new THREE.Vector3(0, 0, 0),
      worldNormal: normal,
      specs: [
        {
          kind: "standing",
          position: new THREE.Vector3(0, 1.5, 0),
        },
      ],
      includeBounce: false,
      interiorExposure: 1,
    });
    const far = evaluateApartmentShellLightingAtPoint({
      worldPos: new THREE.Vector3(4, 0, 0),
      worldNormal: normal,
      specs: [
        {
          kind: "standing",
          position: new THREE.Vector3(0, 1.5, 0),
        },
      ],
      includeBounce: false,
      interiorExposure: 1,
    });
    expect(near.r + near.g + near.b).toBeGreaterThan(far.r + far.g + far.b);
  });
});

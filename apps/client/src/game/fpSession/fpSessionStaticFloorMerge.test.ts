import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { mergeMegablockStaticDirectChildYielding } from "./fpSessionStaticFloorMerge.js";

function glassMat(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: 0xf7fafc, transparent: true, opacity: 0.18 });
}

describe("fpSessionStaticFloorMerge", () => {
  it("keeps a lone N/S corner glass panel unculled through the floor-plate merge pass", async () => {
    const mat = glassMat();
    const plate = new THREE.Group();
    plate.userData.mammothPlateLevelIndex = 18;

    const cladding = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.2), mat);
    const cornerGlass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.78, 0.11), mat);
    cornerGlass.name = "unit_exterior_glass_s_0";
    cornerGlass.userData.mammothSkipFloorGeometryMerge = true;
    cornerGlass.userData.mammothPlacedObjectId = "unit_e_003";
    cornerGlass.userData.mammothUnitInterior = true;
    cornerGlass.userData.mammothResidentialUnitExteriorGlass = true;
    plate.add(cladding, cornerGlass);

    await mergeMegablockStaticDirectChildYielding(plate, async () => {});

    expect(cornerGlass.frustumCulled).toBe(false);
  });

  it("keeps merged exterior glass unculled when corridor end-cap panes share a material", async () => {
    const mat = glassMat();
    const plate = new THREE.Group();
    plate.userData.mammothPlateLevelIndex = 18;

    const cladding = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 0.2), mat);
    const northGlass = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.2, 0.11), mat);
    northGlass.name = "unit_exterior_glass_n_0";
    northGlass.userData.mammothSkipFloorGeometryMerge = true;
    northGlass.userData.mammothPlacedObjectId = "corridor_main";
    const southGlass = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.2, 0.11), mat);
    southGlass.name = "unit_exterior_glass_s_0";
    southGlass.userData.mammothSkipFloorGeometryMerge = true;
    southGlass.userData.mammothPlacedObjectId = "corridor_main";
    plate.add(cladding, northGlass, southGlass);

    await mergeMegablockStaticDirectChildYielding(plate, async () => {});

    const mergedGlass = plate.children.find(
      (child) =>
        child instanceof THREE.Mesh &&
        child.name === "merged_unit_shell:corridor_main" &&
        child.userData.mammothResidentialUnitExteriorGlass === true,
    ) as THREE.Mesh | undefined;
    expect(mergedGlass).toBeTruthy();
    expect(mergedGlass!.frustumCulled).toBe(false);
  });

  it("merges static stair shaft fragments within each visibility segment", async () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x777777 });
    const stairColumn = new THREE.Group();
    stairColumn.userData.mammothStairColumnRoot = true;
    const segment = new THREE.Group();
    segment.userData.mammothPlateLevelIndex = 8;
    stairColumn.add(segment);

    for (const name of ["shaft_wall_e_left", "shaft_wall_e_right", "shaft_ceiling"]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      mesh.name = name;
      mesh.userData.mammothSkipFloorGeometryMerge = true;
      segment.add(mesh);
    }
    for (const name of ["shaft_wall_e_exterior_left", "shaft_wall_e_exterior_right"]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.02), mat);
      mesh.name = name;
      mesh.userData.mammothSkipFloorGeometryMerge = true;
      segment.add(mesh);
    }
    const preservedSign = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.02), mat);
    preservedSign.name = "stairwell_corridor_sign";
    preservedSign.userData.mammothSkipFloorGeometryMerge = true;
    segment.add(preservedSign);

    await mergeMegablockStaticDirectChildYielding(stairColumn, async () => {});

    const meshes: THREE.Mesh[] = [];
    segment.traverse((obj) => {
      if (obj instanceof THREE.Mesh) meshes.push(obj);
    });
    expect(meshes).toHaveLength(3);
    expect(
      meshes.filter(
        (mesh) => mesh !== preservedSign && mesh.userData.mammothUnitInterior === true,
      ),
    ).toHaveLength(1);
    expect(
      meshes.filter(
        (mesh) => mesh !== preservedSign && mesh.userData.mammothUnitInterior !== true,
      ),
    ).toHaveLength(1);
    expect(preservedSign.parent).toBe(segment);
  });
});

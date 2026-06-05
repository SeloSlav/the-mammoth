import * as THREE from "three";
import { MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER } from "@the-mammoth/engine";
import { bench, describe } from "vitest";
import { createFpApartmentStashRayOcclusion } from "./fpApartmentStashRayOcclusion.js";

const STOREYS = 19;
const UNITS_PER_STOREY = 24;
const TARGET_UNIT_KEY = "floor|10|unit_000";

function buildTowerFixture(): {
  buildingRoot: THREE.Group;
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;
} {
  const buildingRoot = new THREE.Group();
  for (let level = 1; level <= STOREYS; level++) {
    for (let unit = 0; unit < UNITS_PER_STOREY; unit++) {
      const group = new THREE.Group();
      group.userData.mammothApartmentUnitKey = `floor|${level}|unit_${unit
        .toString()
        .padStart(3, "0")}`;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 4));
      wall.position.set(unit * 8, level * 3.2 + 1.25, 0);
      wall.userData.mammothUnitInterior = true;
      wall.layers.set(MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER);
      group.add(wall);
      buildingRoot.add(group);
    }
  }
  buildingRoot.updateMatrixWorld(true);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
  camera.position.set(0, 10 * 3.2 + 1.6, -2);
  camera.lookAt(0, 10 * 3.2 + 1.4, 3);
  camera.updateMatrixWorld(true);
  return {
    buildingRoot,
    camera,
    target: new THREE.Vector3(0, 10 * 3.2 + 1, 3),
  };
}

const fixture = buildTowerFixture();
const occlusion = createFpApartmentStashRayOcclusion();
occlusion.rebuildFromBuildingRoot(fixture.buildingRoot);

describe("apartment stash ray occlusion traversal", () => {
  bench("global visible-building blockers", () => {
    occlusion.targetOccludedFromCamera(fixture.camera, fixture.target);
  });

  bench("authored apartment-volume blockers", () => {
    occlusion.targetOccludedFromCamera(fixture.camera, fixture.target, TARGET_UNIT_KEY);
  });
});

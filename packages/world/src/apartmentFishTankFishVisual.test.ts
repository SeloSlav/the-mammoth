import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildNormalizedFishPrototype,
  createApartmentFishTankFishSchool,
  spawnFishInstanceFromPrototype,
} from "./apartmentFishTankFishVisual.js";

function makeFishTemplateMesh(): THREE.Group {
  const g = new THREE.Group();
  const geom = new THREE.BoxGeometry(0.2, 0.05, 0.08);
  const mat = new THREE.MeshStandardMaterial();
  g.add(new THREE.Mesh(geom, mat));
  return g;
}

describe("apartmentFishTankFishVisual", () => {
  it("shares geometry across instances spawned from one prototype", () => {
    const prototype = buildNormalizedFishPrototype(makeFishTemplateMesh());
    const a = spawnFishInstanceFromPrototype(prototype);
    const b = spawnFishInstanceFromPrototype(prototype);

    const meshA = a.children[0] as THREE.Mesh;
    const meshB = b.children[0] as THREE.Mesh;
    expect(meshA.geometry).toBe(meshB.geometry);
    expect(meshA.material).toBe(meshB.material);
  });

  it("keeps fish upright — pitch and roll stay zero after update", () => {
    const tankVis = new THREE.Group();
    const school = createApartmentFishTankFishSchool(tankVis, "test-upright", {
      fishTemplateRoot: makeFishTemplateMesh(),
    });

    for (let frame = 0; frame < 120; frame++) {
      school.update(0.016);
    }

    const swimmers = tankVis.getObjectByName("apartment_fish_tank_swimmers");
    expect(swimmers).toBeTruthy();
    swimmers!.traverse((o) => {
      if (!o.name.startsWith("fish_tank_fish:")) return;
      expect(o.rotation.x).toBe(0);
      expect(o.rotation.z).toBe(0);
    });
  });
});

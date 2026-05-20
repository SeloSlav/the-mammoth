import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  apartmentCeilingFixtureBulbWorldPosition,
  apartmentStandingLampShadeBulbWorldPosition,
} from "./apartmentStandingLampShadeBulb.js";

describe("apartmentStandingLampShadeBulbWorldPosition", () => {
  it("places the bulb at the shade band center, not offset toward the room", () => {
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

    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const bulb = new THREE.Vector3();
    apartmentStandingLampShadeBulbWorldPosition(box, size, bulb);

    expect(bulb.x).toBeCloseTo((box.min.x + box.max.x) * 0.5, 5);
    expect(bulb.z).toBeCloseTo((box.min.z + box.max.z) * 0.5, 5);
    expect(bulb.y).toBeGreaterThan(1.05);
    expect(bulb.y).toBeLessThan(1.25);
  });
});

describe("apartmentCeilingFixtureBulbWorldPosition", () => {
  it("places the orb at the fixture bbox center", () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.12, 0.35),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.y = 0.06;
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const bulb = new THREE.Vector3();
    apartmentCeilingFixtureBulbWorldPosition(box, bulb);
    expect(bulb.x).toBeCloseTo(0, 5);
    expect(bulb.y).toBeCloseTo(0.06, 3);
    expect(bulb.z).toBeCloseTo(0, 5);
  });
});

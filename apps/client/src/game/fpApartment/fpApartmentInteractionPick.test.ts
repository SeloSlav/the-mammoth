import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { fitApartmentInteractionPickToObject } from "./fpApartmentInteractionPick.js";

describe("fitApartmentInteractionPickToObject", () => {
  it("places pick center in parent local space when parent is rotated", () => {
    const parent = new THREE.Group();
    parent.position.set(5, 0, 3);
    parent.rotation.y = Math.PI / 2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    parent.add(box);
    parent.updateMatrixWorld(true);

    const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    fitApartmentInteractionPickToObject(parent, pick, { x: 0.1, y: 0.1, z: 0.1 });
    parent.add(pick);

    const world = new THREE.Vector3();
    pick.getWorldPosition(world);
    expect(world.x).toBeCloseTo(5, 2);
    expect(world.y).toBeCloseTo(0, 2);
    expect(world.z).toBeCloseTo(3, 2);
  });
});

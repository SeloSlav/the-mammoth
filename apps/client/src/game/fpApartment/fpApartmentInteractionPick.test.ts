import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  balconyGrowSlotPickSizeFromTrayBounds,
  fitApartmentInteractionPickToObject,
  fitBalconyGrowSlotInteractionPick,
  fitBalconyGrowTrayCenterInteractionPick,
  fitBalconyGrowTrayInteractionPick,
} from "./fpApartmentInteractionPick.js";

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

  it("matches visual world size when parent is uniformly scaled", () => {
    const parent = new THREE.Group();
    parent.scale.setScalar(0.51);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1.2));
    parent.add(box);
    parent.updateMatrixWorld(true);

    const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    fitApartmentInteractionPickToObject(parent, pick, { x: 0.1, y: 0.1, z: 0.1 });
    parent.add(pick);
    parent.updateMatrixWorld(true);

    const visualSize = new THREE.Box3().setFromObject(box).getSize(new THREE.Vector3());
    const pickSize = new THREE.Box3().setFromObject(pick).getSize(new THREE.Vector3());
    expect(pickSize.x).toBeCloseTo(visualSize.x, 2);
    expect(pickSize.y).toBeCloseTo(visualSize.y, 2);
    expect(pickSize.z).toBeCloseTo(visualSize.z, 2);
  });
});

describe("fitBalconyGrowTrayInteractionPick", () => {
  it("uses rescaled local visual bounds for the tray pick", () => {
    const tray = new THREE.Group();
    tray.scale.setScalar(0.51);
    tray.add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 1.4)));

    const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    fitBalconyGrowTrayInteractionPick(tray, pick);
    tray.add(pick);
    tray.updateMatrixWorld(true);

    const visualSize = new THREE.Box3().setFromObject(tray.children[0]!).getSize(new THREE.Vector3());
    const pickSize = new THREE.Box3().setFromObject(pick).getSize(new THREE.Vector3());
    expect(pickSize.x).toBeCloseTo(visualSize.x, 2);
    expect(pickSize.z).toBeCloseTo(visualSize.z, 2);
  });
});

describe("fitBalconyGrowSlotInteractionPick", () => {
  it("centers a quadrant pick at the slot offset with model-derived size", () => {
    const bounds = new THREE.Box3().set(new THREE.Vector3(-0.5, 0, -0.35), new THREE.Vector3(0.5, 0.6, 0.35));
    const size = balconyGrowSlotPickSizeFromTrayBounds(bounds);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    fitBalconyGrowSlotInteractionPick(pick, 0.145, -0.145, size);
    expect(pick.position.x).toBeCloseTo(0.145, 3);
    expect(pick.position.z).toBeCloseTo(-0.145, 3);
    expect(pick.scale.x).toBeCloseTo(size.width, 3);
    expect(pick.scale.y).toBeCloseTo(size.height, 3);
  });
});

describe("fitBalconyGrowTrayCenterInteractionPick", () => {
  it("centers a hub pick at tray origin between quadrants", () => {
    const bounds = new THREE.Box3().set(new THREE.Vector3(-0.5, 0, -0.35), new THREE.Vector3(0.5, 0.6, 0.35));
    const size = balconyGrowSlotPickSizeFromTrayBounds(bounds);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    fitBalconyGrowTrayCenterInteractionPick(pick, size);
    expect(pick.position.x).toBeCloseTo(0, 3);
    expect(pick.position.z).toBeCloseTo(0, 3);
    expect(pick.scale.x).toBeCloseTo(Math.max(0.14, size.width * 0.72), 3);
    expect(pick.scale.y).toBeCloseTo(size.height * 0.88, 3);
  });
});

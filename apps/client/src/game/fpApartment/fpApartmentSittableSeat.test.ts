import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { apartmentSittableSpecFromModelPath } from "@the-mammoth/schemas";
import {
  apartmentSittableLateralSeatLocalX,
  computeDecorGroupLocalBounds,
  resolveApartmentSittableLateralSeatIndex,
} from "./fpApartmentSittableSeat.js";
import { computeApartmentSittableWorldPose } from "./fpApartmentSittablePose.js";

describe("apartment sittable lateral seats", () => {
  it("sofa spec exposes three lateral seats", () => {
    expect(apartmentSittableSpecFromModelPath("static/models/objects/sofa.glb")?.lateralSeatCount).toBe(
      3,
    );
  });

  it("maps aim points along local +X into left, center, and right bands", () => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.8, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.y = 0.4;
    g.add(mesh);
    g.updateMatrixWorld(true);

    const bounds = computeDecorGroupLocalBounds(g, new THREE.Box3());
    const leftX = apartmentSittableLateralSeatLocalX(bounds, 0, 3);
    const centerX = apartmentSittableLateralSeatLocalX(bounds, 1, 3);
    const rightX = apartmentSittableLateralSeatLocalX(bounds, 2, 3);
    expect(leftX).toBeLessThan(centerX);
    expect(centerX).toBeLessThan(rightX);

    const leftWorld = new THREE.Vector3(leftX, 0, 0).applyMatrix4(g.matrixWorld);
    const centerWorld = new THREE.Vector3(centerX, 0, 0).applyMatrix4(g.matrixWorld);
    const rightWorld = new THREE.Vector3(rightX, 0, 0).applyMatrix4(g.matrixWorld);

    expect(resolveApartmentSittableLateralSeatIndex(g, leftWorld, 3)).toBe(0);
    expect(resolveApartmentSittableLateralSeatIndex(g, centerWorld, 3)).toBe(1);
    expect(resolveApartmentSittableLateralSeatIndex(g, rightWorld, 3)).toBe(2);
  });

  it("places feet at distinct X anchors per seat index", () => {
    const spec = apartmentSittableSpecFromModelPath("static/models/objects/sofa.glb");
    expect(spec).not.toBeNull();
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.8, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.y = 0.4;
    g.add(mesh);
    g.position.set(3, 1, 7);
    g.rotation.y = Math.PI / 4;

    const left = computeApartmentSittableWorldPose(g, spec!, 0);
    const center = computeApartmentSittableWorldPose(g, spec!, 1);
    const right = computeApartmentSittableWorldPose(g, spec!, 2);
    expect(left.feetX).not.toBeCloseTo(right.feetX, 1);
    expect(center.feetX).toBeGreaterThan(left.feetX);
    expect(center.feetX).toBeLessThan(right.feetX);
  });
});

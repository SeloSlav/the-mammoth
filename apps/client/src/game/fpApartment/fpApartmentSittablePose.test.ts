import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { apartmentSittableSpecFromModelPath } from "@the-mammoth/schemas";
import { computeApartmentSittableWorldPose } from "./fpApartmentSittablePose.js";

describe("computeApartmentSittableWorldPose", () => {
  it("maps local seat offset and yaw from group transform", () => {
    const spec = apartmentSittableSpecFromModelPath("static/models/objects/chair.glb");
    expect(spec).not.toBeNull();
    const g = new THREE.Group();
    g.position.set(10, 2, 5);
    g.rotation.y = Math.PI / 2;
    const pose = computeApartmentSittableWorldPose(g, spec!);
    expect(pose.feetX).toBeCloseTo(10 + spec!.localSeatOffset.z, 2);
    expect(pose.feetY).toBeCloseTo(2 + spec!.localSeatOffset.y, 2);
    expect(pose.feetZ).toBeCloseTo(5 - spec!.localSeatOffset.x, 2);
    expect(pose.bodyYawRad).toBeCloseTo(Math.PI / 2 + spec!.bodyYawOffsetRad, 2);
    expect(pose.mode).toBe("sit");
    expect(pose.defaultPitchRad).toBe(0);
  });

  it("bed lie mode exposes ceiling pitch", () => {
    const spec = apartmentSittableSpecFromModelPath("static/models/objects/bed.glb");
    expect(spec?.mode).toBe("lie");
    const g = new THREE.Group();
    const pose = computeApartmentSittableWorldPose(g, spec!);
    expect(pose.defaultPitchRad).toBe(1.45);
    expect(pose.eyeHeightM).toBeLessThan(0.6);
  });
});

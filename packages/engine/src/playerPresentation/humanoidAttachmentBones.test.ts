import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { resolveSkinnedHumanoidHandBone } from "./humanoidAttachmentBones.js";

describe("resolveSkinnedHumanoidHandBone", () => {
  it("resolves shipped humanoid RightHand (male.glb / female.glb naming)", () => {
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = "Hips";
    const hand = new THREE.Bone();
    hand.name = "RightHand";
    hips.add(hand);
    root.add(hips);
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBe(hand);
  });

  it("resolves Mixamo-style right hand name", () => {
    const root = new THREE.Group();
    const spine = new THREE.Bone();
    spine.name = "mixamorigSpine";
    const hand = new THREE.Bone();
    hand.name = "mixamorigRightHand";
    spine.add(hand);
    root.add(spine);
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBe(hand);
  });

  it("returns null when no known name exists", () => {
    const root = new THREE.Group();
    root.add(new THREE.Bone());
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBeNull();
  });

  it("caches per model root", () => {
    const root = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = "RightHand";
    root.add(hand);
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBe(hand);
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBe(hand);
  });
});

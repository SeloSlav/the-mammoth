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

  it("falls back to SkinnedMesh.skeleton.bones when the hand is not in the scene graph", () => {
    const root = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = "RightHand";
    const mesh = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.bind(new THREE.Skeleton([hand]));
    root.add(mesh);
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBe(hand);
  });

  it("returns null when no known name exists", () => {
    const root = new THREE.Group();
    root.add(new THREE.Bone());
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBeNull();
  });

  it("caches successful right-hand hits per model root", () => {
    const root = new THREE.Group();
    const hand = new THREE.Bone();
    hand.name = "RightHand";
    root.add(hand);
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBe(hand);
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBe(hand);
  });

  it("does not cache null so a later valid rig still resolves", () => {
    const root = new THREE.Group();
    root.add(new THREE.Bone());
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBeNull();
    const hand = new THREE.Bone();
    hand.name = "RightHand";
    root.add(hand);
    expect(resolveSkinnedHumanoidHandBone(root, "right")).toBe(hand);
  });
});

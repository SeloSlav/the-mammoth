import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { nearestBalconyGrowTraySlot } from "./fpPlacementSnap.js";

describe("nearestBalconyGrowTraySlot", () => {
  it("picks closest slot in tray local space", () => {
    const m = new THREE.Matrix4().identity();
    const aim = new THREE.Vector3(0.1, 0, 0.1);
    const snap = nearestBalconyGrowTraySlot(m, aim);
    expect(snap).not.toBeNull();
    expect(snap!.slotIndex).toBe(3);
  });

  it("maps negative local aim to slot 0", () => {
    const m = new THREE.Matrix4().identity();
    const aim = new THREE.Vector3(-0.11, 0, -0.11);
    const snap = nearestBalconyGrowTraySlot(m, aim);
    expect(snap?.slotIndex).toBe(0);
  });
});

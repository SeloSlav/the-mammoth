import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  resetFpDebugEmissiveIsolationState,
  syncFpDebugEmissiveMaterialsIsolation,
} from "./fpDebugEmissiveIsolation.js";

describe("syncFpDebugEmissiveMaterialsIsolation", () => {
  it("zeros emissive while disabled and restores when re-enabled", () => {
    resetFpDebugEmissiveIsolationState();
    const root = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffaa44,
      emissiveIntensity: 0.5,
    });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));

    syncFpDebugEmissiveMaterialsIsolation(root, false);
    expect(mat.emissive.getHex()).toBe(0x000000);
    expect(mat.emissiveIntensity).toBe(0);

    syncFpDebugEmissiveMaterialsIsolation(root, false);
    expect(mat.emissive.getHex()).toBe(0x000000);

    syncFpDebugEmissiveMaterialsIsolation(root, true);
    expect(mat.emissive.getHex()).toBe(0xffaa44);
    expect(mat.emissiveIntensity).toBe(0.5);
  });

  it("suppresses newly added meshes while isolation stays off", () => {
    resetFpDebugEmissiveIsolationState();
    const root = new THREE.Group();
    syncFpDebugEmissiveMaterialsIsolation(root, false);

    const mat = new THREE.MeshStandardMaterial({ emissive: 0x112233, emissiveIntensity: 2 });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));

    syncFpDebugEmissiveMaterialsIsolation(root, false);
    expect(mat.emissive.getHex()).toBe(0x000000);
    expect(mat.emissiveIntensity).toBe(0);
  });
});

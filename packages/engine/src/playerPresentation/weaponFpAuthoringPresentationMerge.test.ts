import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildWeaponFirstPersonPresentationMergeFromPickList } from "./weaponFpAuthoringPresentationMerge.js";

describe("buildWeaponFirstPersonPresentationMergeFromPickList", () => {
  it("exports aimRigRoot from the aim rig pick", () => {
    const aimRig = new THREE.Group();
    aimRig.position.set(0.118, -0.232, -0.452);
    aimRig.rotation.set(0, 0.035, -1.62, "XYZ");

    const merge = buildWeaponFirstPersonPresentationMergeFromPickList([
      { id: "aimRigRoot", label: "Aim rig", object: aimRig },
    ]);

    expect(merge.fpViewmodel?.aimRigRoot).toEqual({
      positionM: { x: 0.118, y: -0.232, z: -0.452 },
      eulerRad: { x: 0, y: 0.035, z: -1.62 },
    });
  });
});

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { upgradeApartmentDecorMaterialToStandard } from "./apartmentDecorMaterialUpgrade.js";
import { moodGradeMammothApartmentDecorMaterial } from "./apartmentDecorMoodGrade.js";

describe("upgradeApartmentDecorMaterialToStandard", () => {
  it("converts MeshBasicMaterial to MeshStandardMaterial", () => {
    const basic = new THREE.MeshBasicMaterial({ color: 0xff8040 });
    const standard = upgradeApartmentDecorMaterialToStandard(basic);
    expect(standard).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(standard.color.getHex()).toBe(0xff8040);
  });

  it("mood-grades non-fixture decor without boosting emissive", () => {
    const graded = moodGradeMammothApartmentDecorMaterial(
      new THREE.MeshPhongMaterial({ emissive: 0xffffff, emissiveIntensity: 2 }),
      { modelRelPath: "static/models/objects/chair.glb" },
    );
    expect(graded).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((graded as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0x000000);
  });
});

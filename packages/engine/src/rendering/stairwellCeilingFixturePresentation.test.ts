import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyMammothStairwellCeilingFixtureVisual,
  ensureMammothStairwellCeilingFixtureVisuals,
  MAMMOTH_STAIRWELL_CEILING_VISUAL_APPLIED_UD,
} from "./stairwellCeilingFixturePresentation.js";

describe("ensureMammothStairwellCeilingFixtureVisuals", () => {
  it("applies mood grade once per stairwell ceiling wrap", () => {
    const buildingRoot = new THREE.Group();
    const wrap = new THREE.Group();
    wrap.userData.mammothStairwellCeilingLight = true;
    wrap.userData.mammothApartmentDecorModelRelPath = "objects/light-ceiling-2.glb";
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.05, 0.2),
      new THREE.MeshStandardMaterial({ emissiveIntensity: 1 }),
    );
    wrap.add(mesh);
    buildingRoot.add(wrap);

    ensureMammothStairwellCeilingFixtureVisuals(buildingRoot);
    const matAfterFirst = (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity;
    expect(wrap.userData[MAMMOTH_STAIRWELL_CEILING_VISUAL_APPLIED_UD]).toBe(true);

    applyMammothStairwellCeilingFixtureVisual(
      wrap,
      "objects/light-ceiling-2.glb",
    );
    const matAfterSecond = (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity;
    expect(matAfterSecond).toBeCloseTo(matAfterFirst, 6);

    ensureMammothStairwellCeilingFixtureVisuals(buildingRoot);
    const matAfterThird = (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity;
    expect(matAfterThird).toBeCloseTo(matAfterFirst, 6);
  });
});

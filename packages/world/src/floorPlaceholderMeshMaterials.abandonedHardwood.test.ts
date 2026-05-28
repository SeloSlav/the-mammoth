import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { apartmentUnitAbandonedHardwoodFloorMaterial } from "./floorPlaceholderMeshMaterials.js";

describe("apartmentUnitAbandonedHardwoodFloorMaterial", () => {
  it("loads PATINA hardwood-fungus maps with floor shell normal scale", () => {
    const m = apartmentUnitAbandonedHardwoodFloorMaterial;
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m.normalScale.x).toBe(1.26);
    expect(m.color.getHex()).toBe(0xffffff);
  });
});

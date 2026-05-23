import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  APARTMENT_FISH_TANK_DEPTH_M,
  APARTMENT_FISH_TANK_HEIGHT_M,
  APARTMENT_FISH_TANK_MODEL_PATH,
  APARTMENT_FISH_TANK_WIDTH_M,
  buildApartmentFishTankVisual,
  isApartmentFishTankModelPath,
} from "./apartmentFishTankVisual.js";

function meshTriangleCount(root: THREE.Object3D): number {
  let tris = 0;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geo = obj.geometry;
    if (!geo) return;
    if (geo.index) tris += geo.index.count / 3;
    else if (geo.attributes.position) tris += geo.attributes.position.count / 3;
  });
  return tris;
}

describe("buildApartmentFishTankVisual", () => {
  it("recognizes the legacy catalog path", () => {
    expect(isApartmentFishTankModelPath(APARTMENT_FISH_TANK_MODEL_PATH)).toBe(true);
    expect(isApartmentFishTankModelPath("/static/models/objects/fish-tank.glb")).toBe(true);
    expect(isApartmentFishTankModelPath("static/models/objects/chair.glb")).toBe(false);
  });

  it("matches legacy GLB bounds and stays low-poly", () => {
    const root = buildApartmentFishTankVisual();
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);

    expect(size.x).toBeCloseTo(APARTMENT_FISH_TANK_WIDTH_M, 2);
    expect(size.y).toBeCloseTo(APARTMENT_FISH_TANK_HEIGHT_M, 2);
    expect(size.z).toBeCloseTo(APARTMENT_FISH_TANK_DEPTH_M, 2);
    expect(meshTriangleCount(root)).toBeLessThan(2500);
  });

  it("includes sand and water volumes", () => {
    const root = buildApartmentFishTankVisual();
    expect(root.getObjectByName("fish_tank_sand")).not.toBeNull();
    expect(root.getObjectByName("fish_tank_water")).not.toBeNull();
  });

  it("tags glass and water meshes to skip apartment mood darkening", () => {
    const root = buildApartmentFishTankVisual();
    const skipUd = "mammothApartmentDecorSkipMoodGrade";
    for (const name of [
      "fish_tank_glass_front",
      "fish_tank_glass_back",
      "fish_tank_glass_left",
      "fish_tank_glass_right",
      "fish_tank_water",
    ]) {
      const mesh = root.getObjectByName(name);
      expect(mesh?.userData[skipUd]).toBe(true);
    }
    expect(root.getObjectByName("fish_tank_sand")?.userData[skipUd]).toBeUndefined();
  });
});

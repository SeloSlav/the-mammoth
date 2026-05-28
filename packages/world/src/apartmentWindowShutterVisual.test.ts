import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  APARTMENT_WINDOW_SHUTTER_DEPTH_M,
  APARTMENT_WINDOW_SHUTTER_HEIGHT_M,
  APARTMENT_WINDOW_SHUTTER_MODEL_PATH,
  APARTMENT_WINDOW_SHUTTER_WIDTH_M,
  buildApartmentWindowShutterVisual,
  isApartmentWindowShutterModelPath,
  MAMMOTH_EXTERIOR_FACADE_DECOR_UD,
} from "./apartmentWindowShutterVisual.js";

function meshTriangleCount(root: THREE.Object3D): number {
  let tris = 0;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geo = obj.geometry;
    if (!geo) return;
    if (geo.index) {
      tris += geo.index.count / 3;
    } else if (geo.attributes.position) {
      tris += geo.attributes.position.count / 3;
    }
  });
  return tris;
}

describe("buildApartmentWindowShutterVisual", () => {
  it("recognizes the legacy catalog path", () => {
    expect(isApartmentWindowShutterModelPath(APARTMENT_WINDOW_SHUTTER_MODEL_PATH)).toBe(true);
    expect(isApartmentWindowShutterModelPath("/static/models/objects/window-shutter.glb")).toBe(true);
    expect(isApartmentWindowShutterModelPath("static/models/objects/chair.glb")).toBe(false);
  });

  it("matches legacy GLB bounds and stays low-poly", () => {
    const root = buildApartmentWindowShutterVisual();
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);

    expect(size.x).toBeCloseTo(APARTMENT_WINDOW_SHUTTER_WIDTH_M, 2);
    expect(size.y).toBeCloseTo(APARTMENT_WINDOW_SHUTTER_HEIGHT_M, 2);
    expect(size.z).toBeCloseTo(APARTMENT_WINDOW_SHUTTER_DEPTH_M, 2);
    expect(meshTriangleCount(root)).toBeLessThan(1700);
    expect(root.getObjectByName("shutter_casing_top")).toBeTruthy();
    expect(root.userData[MAMMOTH_EXTERIOR_FACADE_DECOR_UD]).toBe(true);
  });
});

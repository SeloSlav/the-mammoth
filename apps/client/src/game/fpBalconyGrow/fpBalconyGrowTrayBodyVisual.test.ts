import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  GROW_TRAY_EMPTY_MODEL_PATH,
  GROW_TRAY_LEGACY_FILLED_MODEL_PATH,
  isGrowTrayModelPath,
  resolveGrowTrayDecorModelRelPath,
} from "./fpBalconyGrowTrayDecor.js";
import {
  mountGrowTrayCompostPebbles,
  syncGrowTrayCompostPebbles,
  syncGrowTrayMoistureTint,
} from "./fpBalconyGrowTraySurfaceVisual.js";

describe("grow tray surface visuals", () => {
  it("recognizes empty and legacy tray model paths", () => {
    expect(isGrowTrayModelPath(GROW_TRAY_EMPTY_MODEL_PATH)).toBe(true);
    expect(isGrowTrayModelPath(GROW_TRAY_LEGACY_FILLED_MODEL_PATH)).toBe(true);
    expect(isGrowTrayModelPath("static/models/objects/chair.glb")).toBe(false);
  });

  it("always resolves grow tray decor to the empty mesh", () => {
    expect(resolveGrowTrayDecorModelRelPath(GROW_TRAY_LEGACY_FILLED_MODEL_PATH)).toBe(
      GROW_TRAY_EMPTY_MODEL_PATH,
    );
    expect(resolveGrowTrayDecorModelRelPath(GROW_TRAY_EMPTY_MODEL_PATH)).toBe(
      GROW_TRAY_EMPTY_MODEL_PATH,
    );
    expect(resolveGrowTrayDecorModelRelPath("static/models/objects/chair.glb")).toBe(
      "static/models/objects/chair.glb",
    );
  });

  it("shows compost pebbles when stash holds substrate", () => {
    const decor = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.08, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    decor.add(mesh);
    mountGrowTrayCompostPebbles(decor, "tray-a", 0.04);

    syncGrowTrayCompostPebbles(decor, false);
    const group = decor.userData.mammothGrowTrayCompostPebbles as THREE.Group;
    expect(group.visible).toBe(false);
    expect(group.children.length).toBeGreaterThan(10);

    syncGrowTrayCompostPebbles(decor, true);
    expect(group.visible).toBe(true);
  });

  it("darkens tray surface when watered", () => {
    const decor = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    decor.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.4), mat));

    syncGrowTrayMoistureTint(decor, 0);
    const dry = mat.color.clone();

    syncGrowTrayMoistureTint(decor, 1.5);
    expect(mat.color.r).toBeLessThan(dry.r);
    expect(mat.color.g).toBeLessThan(dry.g);
    expect(mat.color.b).toBeLessThan(dry.b);
  });
});

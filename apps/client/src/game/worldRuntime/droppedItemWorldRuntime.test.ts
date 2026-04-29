import * as THREE from "three";
import {
  getMammothDroppedWorldTargetMaxDimM,
  MAMMOTH_DROPPED_WORLD_DEFAULT_TARGET_MAX_DIM_M,
} from "@the-mammoth/assets";
import { describe, expect, it } from "vitest";
import { fitDroppedWorldItemModelToCatalog } from "./droppedItemWorldRuntime";

describe("fitDroppedWorldItemModelToCatalog", () => {
  it("scales to target max extent and bottoms out on Y", () => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3));
    g.add(mesh);
    /** box max edge = 3 m → target pistol 0.2 m ⇒ scale × (0.2/3) */
    fitDroppedWorldItemModelToCatalog(g, "pistol");
    g.updateWorldMatrix(true, true);
    const bb = new THREE.Box3().setFromObject(g);
    const sz = new THREE.Vector3();
    bb.getSize(sz);
    expect(Math.max(sz.x, sz.y, sz.z)).toBeCloseTo(getMammothDroppedWorldTargetMaxDimM("pistol"), 5);
    expect(bb.min.y).toBeCloseTo(0, 5);
  });
});

describe("dropped world sizing table", () => {
  it("uses sane defaults for unknown ids", () => {
    expect(getMammothDroppedWorldTargetMaxDimM("__no_such_def__")).toBe(
      MAMMOTH_DROPPED_WORLD_DEFAULT_TARGET_MAX_DIM_M,
    );
  });

  it("covers common loot / drop ids", () => {
    expect(getMammothDroppedWorldTargetMaxDimM("ammo-9mm")).toBeLessThan(getMammothDroppedWorldTargetMaxDimM("crowbar"));
    expect(getMammothDroppedWorldTargetMaxDimM("crowbar")).toBeLessThan(1);
    expect(getMammothDroppedWorldTargetMaxDimM("gunsmith-workbench")).toBeGreaterThan(0.5);
  });
});

import * as THREE from "three";
import {
  getMammothDroppedWorldTargetMaxDimM,
  MAMMOTH_DROPPED_WORLD_DEFAULT_TARGET_MAX_DIM_M,
  MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M,
} from "@the-mammoth/assets";
import { describe, expect, it } from "vitest";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "@the-mammoth/world";
import {
  droppedPickupWithinServerVolume,
  fitDroppedWorldItemModelToCatalog,
  MAMMOTH_PICKUP_MAX_ABS_DY_M,
  MAMMOTH_PICKUP_RADIUS_M,
} from "./droppedItemWorldRuntime";

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

describe("world loot ground plane (Spacetime anchors)", () => {
  it("MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M matches server WORLD_LOOT_Y_GROUND_FLOOR_M", () => {
    expect(MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M).toBeCloseTo(0.28, 5);
  });
});

describe("droppedPickupWithinServerVolume", () => {
  it("allows pickup within horizontal radius regardless of moderate vertical separation", () => {
    expect(
      droppedPickupWithinServerVolume(0, 1.6, 0, 1.0, 0.28, 0, MAMMOTH_PICKUP_RADIUS_M),
    ).toBe(true);
  });

  it("rejects when horizontal distance exceeds radius", () => {
    expect(droppedPickupWithinServerVolume(0, 1.6, 0, 10, 0.28, 0)).toBe(false);
  });

  it("rejects when vertical separation exceeds max abs dy", () => {
    expect(
      droppedPickupWithinServerVolume(
        0,
        10,
        0,
        0,
        0.28,
        0,
        MAMMOTH_PICKUP_RADIUS_M,
        MAMMOTH_PICKUP_MAX_ABS_DY_M,
      ),
    ).toBe(false);
  });

  it("rejects same-XZ pickup one storey away (stacked plates)", () => {
    const plate0 = 0;
    const plate1 = plate0 + DEFAULT_BUILDING_FLOOR_SPACING_M;
    expect(
      droppedPickupWithinServerVolume(0, plate0, 0, 0, plate1 + 0.28, 0, MAMMOTH_PICKUP_RADIUS_M),
    ).toBe(false);
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

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
  dropVerticalBandMatchesFeet,
  fitDroppedWorldItemModelToCatalog,
  MAMMOTH_PICKUP_MAX_ABS_DY_M,
  MAMMOTH_PICKUP_RADIUS_M,
  resolveDroppedItemVisualVisible,
  tryNormalizeDroppedItemId,
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

describe("tryNormalizeDroppedItemId", () => {
  it("treats u64-friendly number, bigint, and decimal string as the same key", () => {
    expect(tryNormalizeDroppedItemId(42n)).toBe(42n);
    expect(tryNormalizeDroppedItemId(42)).toBe(42n);
    expect(tryNormalizeDroppedItemId("42")).toBe(42n);
  });

  it("returns null for unsupported id shapes", () => {
    expect(tryNormalizeDroppedItemId(undefined)).toBe(null);
    expect(tryNormalizeDroppedItemId({})).toBe(null);
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

  it("rejects same-XZ pickup one storey away (band gate)", () => {
    const plate0 = 0;
    const plate1 = plate0 + DEFAULT_BUILDING_FLOOR_SPACING_M;
    const bands = {
      buildingWorldOriginY: 0,
      floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
    };
    expect(
      droppedPickupWithinServerVolume(
        0,
        plate0,
        0,
        0,
        plate1 + 0.28,
        0,
        MAMMOTH_PICKUP_RADIUS_M,
        MAMMOTH_PICKUP_MAX_ABS_DY_M,
        bands,
      ),
    ).toBe(false);
  });

  it("allows anchored loot resting above walk slab when raw Y straddles storey bands (upper floors)", () => {
    const spacing = DEFAULT_BUILDING_FLOOR_SPACING_M;
    const bands = { buildingWorldOriginY: 0, floorSpacingM: spacing };
    const feetY = 12.63;
    const dropY = feetY + MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M;
    expect(
      droppedPickupWithinServerVolume(
        0,
        feetY,
        0,
        0,
        dropY,
        0,
        MAMMOTH_PICKUP_RADIUS_M,
        MAMMOTH_PICKUP_MAX_ABS_DY_M,
        bands,
      ),
    ).toBe(true);
  });

  /**
   * World-anchor `findNearestDroppedPickup` historically omitted `verticalBands` while plain drops used it.
   * |Δy| parachute alone can exceed one storey height, so stacked floors with aligned XZ must use bands.
   */
  it("parachute |Δy| alone does not reject adjacent storey — discrete band does", () => {
    const spacing = DEFAULT_BUILDING_FLOOR_SPACING_M;
    const feetY = 0.1;
    const dropY = feetY + spacing * 0.95;
    expect(
      droppedPickupWithinServerVolume(
        0,
        feetY,
        0,
        0,
        dropY,
        0,
        MAMMOTH_PICKUP_RADIUS_M,
        MAMMOTH_PICKUP_MAX_ABS_DY_M,
      ),
    ).toBe(true);
    expect(
      droppedPickupWithinServerVolume(
        0,
        feetY,
        0,
        0,
        dropY,
        0,
        MAMMOTH_PICKUP_RADIUS_M,
        MAMMOTH_PICKUP_MAX_ABS_DY_M,
        { buildingWorldOriginY: 0, floorSpacingM: spacing },
      ),
    ).toBe(false);
  });
});

describe("resolveDroppedItemVisualVisible", () => {
  const bands = { buildingWorldOriginY: 0, floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M };
  const feetY = 12.63;
  const sameFloorDropY = feetY + MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M;

  it("shows corridor loot on the viewer storey when not inside a unit", () => {
    expect(
      resolveDroppedItemVisualVisible({
        dropX: 0,
        dropY: sameFloorDropY,
        dropZ: 0,
        feetY,
        verticalBands: bands,
        containingUnitKey: null,
        dropResidentialUnitKey: null,
      }),
    ).toBe(true);
  });

  it("hides apartment-interior loot from the hallway on the same storey", () => {
    expect(
      resolveDroppedItemVisualVisible({
        dropX: 0,
        dropY: sameFloorDropY,
        dropZ: 0,
        feetY,
        verticalBands: bands,
        containingUnitKey: null,
        dropResidentialUnitKey: "floor_a|20|unit_e_003",
      }),
    ).toBe(false);
  });

  it("shows loot inside the containing unit even when band matching is the primary gate", () => {
    expect(
      resolveDroppedItemVisualVisible({
        dropX: 0,
        dropY: sameFloorDropY,
        dropZ: 0,
        feetY,
        verticalBands: bands,
        containingUnitKey: "floor_a|20|unit_e_003",
        dropResidentialUnitKey: "floor_a|20|unit_e_003",
      }),
    ).toBe(true);
  });

  it("hides another unit's loot while inside a residential unit on the same storey", () => {
    expect(
      resolveDroppedItemVisualVisible({
        dropX: 0,
        dropY: sameFloorDropY,
        dropZ: 0,
        feetY,
        verticalBands: bands,
        containingUnitKey: "floor_a|20|unit_a",
        dropResidentialUnitKey: "floor_a|20|unit_b",
      }),
    ).toBe(false);
  });

  it("still allows corridor loot on the same storey while inside a unit", () => {
    expect(
      resolveDroppedItemVisualVisible({
        dropX: 0,
        dropY: sameFloorDropY,
        dropZ: 0,
        feetY,
        verticalBands: bands,
        containingUnitKey: "floor_a|20|unit_a",
        dropResidentialUnitKey: null,
      }),
    ).toBe(true);
  });

  it("rejects a different storey unless the drop is in the containing unit", () => {
    const otherStoreyY = feetY + DEFAULT_BUILDING_FLOOR_SPACING_M + 0.28;
    expect(dropVerticalBandMatchesFeet(feetY, otherStoreyY, bands)).toBe(false);
    expect(
      resolveDroppedItemVisualVisible({
        dropX: 0,
        dropY: otherStoreyY,
        dropZ: 0,
        feetY,
        verticalBands: bands,
        containingUnitKey: null,
        dropResidentialUnitKey: null,
      }),
    ).toBe(false);
    expect(
      resolveDroppedItemVisualVisible({
        dropX: 0,
        dropY: otherStoreyY,
        dropZ: 0,
        feetY,
        verticalBands: bands,
        containingUnitKey: "floor_a|20|unit_a",
        dropResidentialUnitKey: "floor_a|20|unit_a",
      }),
    ).toBe(true);
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
    expect(getMammothDroppedWorldTargetMaxDimM("improvised-cook-fire")).toBeGreaterThan(0.35);
  });
});

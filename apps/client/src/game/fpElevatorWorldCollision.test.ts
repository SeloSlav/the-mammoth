import { describe, expect, it } from "vitest";
import {
  type CollisionAabb,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  elevatorCabGameplayHalfExtentsM,
  elevatorSupportFeetWorldY,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type { ElevatorCar, ElevatorLandingDoor } from "../module_bindings/types.js";
import { ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN } from "./fpElevatorConstants.js";
import { landingExteriorDoorRowKey } from "./fpElevatorLandingExteriorDoor.js";
import {
  type FpElevatorWorldCollisionAuth,
  visitFpElevatorWorldCollisionAabbsInXZ,
} from "./fpElevatorWorldCollision.js";

const SHAFT_LOCAL_Y = 1.6589473684210527;
const SHAFT_SY = DEFAULT_BUILDING_FLOOR_SPACING_M;

function testLayout(plateX: number, plateZ: number, doorFace: ElevatorShaftLayout["doorFace"]): ElevatorShaftLayout {
  return {
    planKey: "test",
    plateX,
    plateZ,
    plateLocalY: SHAFT_LOCAL_Y,
    sx: 2.38,
    sy: SHAFT_SY,
    sz: 4.0,
    doorFace,
  };
}

function feetYForLayout(layout: ElevatorShaftLayout, level: number): number {
  return elevatorSupportFeetWorldY({
    buildingWorldOriginY: 0,
    levelIndex: level,
    floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
    shaftPlateLocalY: layout.plateLocalY,
    shaftSy: layout.sy,
  });
}

function collectHits(
  auth: FpElevatorWorldCollisionAuth,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): CollisionAabb[] {
  const out: CollisionAabb[] = [];
  visitFpElevatorWorldCollisionAabbsInXZ(auth, x0, x1, z0, z1, (a) => out.push(a));
  return out;
}

function car(over: Partial<ElevatorCar> & Pick<ElevatorCar, "shaftKey" | "cabFloorY">): ElevatorCar {
  return {
    shaftKey: over.shaftKey,
    currentLevel: over.currentLevel ?? 1,
    doorOpen01: over.doorOpen01 ?? 0,
    phase: over.phase ?? 0,
    moveFromLevel: over.moveFromLevel ?? 1,
    moveToLevel: over.moveToLevel ?? 1,
    moveU: over.moveU ?? 0,
    destQueue: over.destQueue ?? [],
    cabFloorY: over.cabFloorY,
    doorFace: over.doorFace ?? 0,
    plateX: over.plateX ?? 0,
    plateZ: over.plateZ ?? 0,
  };
}

describe("visitFpElevatorWorldCollisionAabbsInXZ", () => {
  const shaftKey = "collision-test-shaft";
  const layout = testLayout(0, 0, "e");
  const { halfX: hx } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);

  it("emits a closed-cab doorway slab when automatic doors are shut (cab-only query, maxLevel=0)", () => {
    const fy1 = feetYForLayout(layout, 1);
    const auth: FpElevatorWorldCollisionAuth = {
      buildingOriginX: 0,
      buildingOriginZ: 0,
      maxLevel: 0,
      latestCars: new Map([
        [
          shaftKey,
          car({
            shaftKey,
            plateX: 0,
            plateZ: 0,
            cabFloorY: fy1,
            doorOpen01: 0,
            doorFace: 0,
          }),
        ],
      ]),
      layoutByKey: new Map([[shaftKey, layout]]),
      landingByRowKey: new Map(),
      feetYForLayout,
    };
    const plateX = 0;
    const x0 = plateX + hx - 0.05;
    const x1 = plateX + hx + 1.2;
    const z0 = -0.5;
    const z1 = 0.5;
    const hits = collectHits(auth, x0, x1, z0, z1);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const spansDoor = hits.some((b) => b.max[0] - b.min[0] > 0.4 && b.max[1] > fy1);
    expect(spansDoor).toBe(true);
  });

  it("does not emit the closed-cab slab when doors are past exit clamp (maxLevel=0 isolates cab path)", () => {
    const fy1 = feetYForLayout(layout, 1);
    const auth: FpElevatorWorldCollisionAuth = {
      buildingOriginX: 0,
      buildingOriginZ: 0,
      maxLevel: 0,
      latestCars: new Map([
        [
          shaftKey,
          car({
            shaftKey,
            plateX: 0,
            plateZ: 0,
            cabFloorY: fy1,
            doorOpen01: Math.max(ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN, 0.99),
            doorFace: 0,
          }),
        ],
      ]),
      layoutByKey: new Map([[shaftKey, layout]]),
      landingByRowKey: new Map(),
      feetYForLayout,
    };
    const plateX = 0;
    const x0 = plateX + hx - 0.05;
    const x1 = plateX + hx + 1.2;
    const z0 = -0.5;
    const z1 = 0.5;
    expect(collectHits(auth, x0, x1, z0, z1)).toHaveLength(0);
  });

  it("splits hoistway front wall into two AABBs when passage is open (E door)", () => {
    const fy1 = feetYForLayout(layout, 1);
    const landing: ElevatorLandingDoor = {
      rowKey: landingExteriorDoorRowKey(shaftKey, 1),
      shaftKey,
      level: 1,
      desiredOpen: 1,
      swingOpen01: 0.95,
    };
    const auth: FpElevatorWorldCollisionAuth = {
      buildingOriginX: 0,
      buildingOriginZ: 0,
      maxLevel: 1,
      latestCars: new Map([
        [
          shaftKey,
          car({
            shaftKey,
            plateX: 0,
            plateZ: 0,
            currentLevel: 1,
            cabFloorY: fy1,
            doorOpen01: 1,
            doorFace: 0,
          }),
        ],
      ]),
      layoutByKey: new Map([[shaftKey, layout]]),
      landingByRowKey: new Map([[landing.rowKey, landing]]),
      feetYForLayout,
    };
    const outerHz = layout.sz * 0.5;
    const plateZ = 0;
    const zMid = plateZ;
    const x0 = -2;
    const x1 = 2;
    const slabBand = collectHits(auth, x0, x1, zMid - outerHz, zMid + outerHz);
    const wallSlabs = slabBand.filter(
      (b) => b.max[1] - b.min[1] > 1.5 && b.max[0] - b.min[0] < 1.5,
    );
    expect(wallSlabs.length).toBeGreaterThanOrEqual(2);
    const zGaps = wallSlabs
      .map((b) => ({ z0: b.min[2], z1: b.max[2] }))
      .sort((a, b) => a.z0 - b.z0);
    expect(zGaps.length).toBeGreaterThanOrEqual(2);
    expect(zGaps[0]!.z1).toBeLessThan(zGaps[1]!.z0 + 1e-3);
  });

  it("emits exterior collision slab when swing is essentially closed", () => {
    const fy1 = feetYForLayout(layout, 1);
    const landing: ElevatorLandingDoor = {
      rowKey: landingExteriorDoorRowKey(shaftKey, 1),
      shaftKey,
      level: 1,
      desiredOpen: 0,
      swingOpen01: 0,
    };
    const auth: FpElevatorWorldCollisionAuth = {
      buildingOriginX: 0,
      buildingOriginZ: 0,
      maxLevel: 1,
      latestCars: new Map([
        [
          shaftKey,
          car({
            shaftKey,
            plateX: 0,
            plateZ: 0,
            cabFloorY: fy1,
            doorOpen01: 0,
            doorFace: 0,
          }),
        ],
      ]),
      layoutByKey: new Map([[shaftKey, layout]]),
      landingByRowKey: new Map([[landing.rowKey, landing]]),
      feetYForLayout,
    };
    const y0 = fy1 + 0.05;
    const y1 = fy1 + 2.0;
    const hits = collectHits(auth, -2, 2, -2, 2).filter((b) => b.min[1] <= y1 && b.max[1] >= y0);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

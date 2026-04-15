import { describe, expect, it } from "vitest";
import {
  type CollisionAabb,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  elevatorCabGameplayHalfExtentsM,
  elevatorSupportFeetWorldY,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type { ElevatorCar, ElevatorLandingDoor } from "../module_bindings/types.js";
import {
  ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN,
  ELEVATOR_PHASE_MOVING,
} from "./fpElevatorConstants.js";
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

  it("does not emit the closed-cab slab when doors are past exit clamp (roof cap still emits)", () => {
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
    const hits = collectHits(auth, x0, x1, z0, z1);
    const tallCabSlab = hits.some((b) => b.max[1] - b.min[1] > 1.5);
    expect(tallCabSlab).toBe(false);
    expect(hits.length).toBe(1);
    expect(hits[0]!.max[1] - hits[0]!.min[1]).toBeLessThan(0.35);
  });

  it("uses evaluated cab feet Y for roof collision instead of stale replicated cabFloorY", () => {
    const fy1 = feetYForLayout(layout, 1);
    const fy2 = feetYForLayout(layout, 2);
    const innerH = Math.max(1.8, layout.sy - 2 * 0.11 - 0.14);
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
            currentLevel: 1,
            moveFromLevel: 1,
            moveToLevel: 2,
            phase: 2,
            cabFloorY: fy1,
            doorOpen01: 0,
            doorFace: 0,
          }),
        ],
      ]),
      layoutByKey: new Map([[shaftKey, layout]]),
      landingByRowKey: new Map(),
      feetYForLayout,
      getCabFloorY: () => fy2,
    };
    const hits = collectHits(auth, -2, 2, -2, 2);
    const roofY0 = fy2 + innerH - 0.08;
    const roofY1 = fy2 + innerH + 0.16;
    const roofAtEvaluatedY = hits.some(
      (b) =>
        Math.abs(b.min[1] - roofY0) < 1e-4 &&
        Math.abs(b.max[1] - roofY1) < 1e-4,
    );
    expect(roofAtEvaluatedY).toBe(true);
  });

  it("uses evaluated door openness so closed-cab slab disappears once the evaluated door is open", () => {
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
      getCabDoorOpen01: () => Math.max(ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN, 0.99),
    };
    const hits = collectHits(auth, hx - 0.05, hx + 1.2, -0.5, 0.5);
    const tallCabSlab = hits.some((b) => b.max[1] - b.min[1] > 1.5);
    expect(tallCabSlab).toBe(false);
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
    const outerHx = layout.sx * 0.5;
    const outerHz = layout.sz * 0.5;
    const plateZ = 0;
    const zMid = plateZ;
    // Query only the door-face side (+X for "e") to avoid picking up cab back wall AABBs.
    const slabBand = collectHits(auth, outerHx - 0.5, outerHx + 1, zMid - outerHz, zMid + outerHz);
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

  it("uses evaluated cab docking + door state when deciding whether the landing passage is open", () => {
    const fy1 = feetYForLayout(layout, 1);
    const fy2 = feetYForLayout(layout, 2);
    const landing: ElevatorLandingDoor = {
      rowKey: landingExteriorDoorRowKey(shaftKey, 2),
      shaftKey,
      level: 2,
      desiredOpen: 1,
      swingOpen01: 0.95,
    };
    const auth: FpElevatorWorldCollisionAuth = {
      buildingOriginX: 0,
      buildingOriginZ: 0,
      maxLevel: 2,
      latestCars: new Map([
        [
          shaftKey,
          car({
            shaftKey,
            plateX: 0,
            plateZ: 0,
            currentLevel: 1,
            cabFloorY: fy1,
            doorOpen01: 0,
            doorFace: 0,
          }),
        ],
      ]),
      layoutByKey: new Map([[shaftKey, layout]]),
      landingByRowKey: new Map([[landing.rowKey, landing]]),
      feetYForLayout,
      getCabFloorY: () => fy2,
      getCabDoorOpen01: () => 1,
    };
    const outerHz = layout.sz * 0.5;
    const hits = collectHits(auth, -2, 2, -outerHz, outerHz).filter(
      (b) => b.min[1] <= fy2 + 1.0 && b.max[1] >= fy2 + 1.0,
    );
    const wallSlabs = hits.filter(
      (b) => b.max[1] - b.min[1] > 1.5 && b.max[0] - b.min[0] < 1.5,
    );
    expect(wallSlabs.length).toBeGreaterThanOrEqual(2);
  });

  it("emits exterior collision slab when swing is essentially closed (cab at different floor)", () => {
    const fy1 = feetYForLayout(layout, 1);
    const fy5 = feetYForLayout(layout, 5);
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
            cabFloorY: fy5,
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

  it("suppresses exterior slab and front wall when cab door slab covers the landing", () => {
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
    const outerHx = layout.sx * 0.5;
    const hits = collectHits(auth, -2, 2, -2, 2);
    const landingY = fy1 + 1.0;
    const landingSlabs = hits.filter(
      (b) =>
        b.min[1] <= landingY &&
        b.max[1] >= landingY &&
        b.min[0] >= outerHx - 0.25 &&
        b.max[0] - b.min[0] < 0.8,
    );
    expect(landingSlabs.length).toBe(0);
  });

  it("suppresses passing landing blockers for a rider inside a moving cab", () => {
    const movingShaftKey = "moving-cab-test-shaft";
    const movingLayout = testLayout(0, 0, "e");
    const cabFloorY =
      feetYForLayout(movingLayout, 1) +
      (feetYForLayout(movingLayout, 2) - feetYForLayout(movingLayout, 1)) * 0.55;
    // Level 3 is far above the cab — cabCoversLanding will be false there,
    // so its landing blockers appear for non-riders but are suppressed for riders.
    const landing3: ElevatorLandingDoor = {
      rowKey: landingExteriorDoorRowKey(movingShaftKey, 3),
      shaftKey: movingShaftKey,
      level: 3,
      desiredOpen: 0,
      swingOpen01: 0,
    };
    const auth: FpElevatorWorldCollisionAuth = {
      buildingOriginX: 0,
      buildingOriginZ: 0,
      maxLevel: 3,
      latestCars: new Map([
        [
          movingShaftKey,
          car({
            shaftKey: movingShaftKey,
            plateX: 0,
            plateZ: 0,
            cabFloorY,
            currentLevel: 1,
            moveFromLevel: 1,
            moveToLevel: 2,
            moveU: 0.55,
            phase: ELEVATOR_PHASE_MOVING,
            doorOpen01: 0,
            doorFace: 0,
          }),
        ],
      ]),
      layoutByKey: new Map([[movingShaftKey, movingLayout]]),
      landingByRowKey: new Map([[landing3.rowKey, landing3]]),
      feetYForLayout,
    };
    const hits = collectHits(auth, 0.7, 2.4, -0.8, 0.8).filter(
      (b) => b.max[1] - b.min[1] > 1.5,
    );
    const riderHits: CollisionAabb[] = [];
    visitFpElevatorWorldCollisionAabbsInXZ(
      auth,
      0.7,
      2.4,
      -0.8,
      0.8,
      (aabb) => riderHits.push(aabb),
      { bodyX: 0, bodyFeetY: cabFloorY + 0.45, bodyZ: 0 },
    );
    const riderTall = riderHits.filter((b) => b.max[1] - b.min[1] > 1.5);
    // Non-rider sees cab door slab + level-3 landing blocker(s).
    expect(hits.length).toBeGreaterThan(1);
    // Rider sees cab door slab but NOT the level-3 landing blockers.
    expect(riderTall.length).toBeLessThan(hits.length);
  });

  it("keeps those blockers for non-riders in the same shaft xz column", () => {
    const movingShaftKey = "moving-cab-test-shaft";
    const movingLayout = testLayout(0, 0, "e");
    const cabFloorY =
      feetYForLayout(movingLayout, 1) +
      (feetYForLayout(movingLayout, 2) - feetYForLayout(movingLayout, 1)) * 0.55;
    const landing: ElevatorLandingDoor = {
      rowKey: landingExteriorDoorRowKey(movingShaftKey, 2),
      shaftKey: movingShaftKey,
      level: 2,
      desiredOpen: 0,
      swingOpen01: 0,
    };
    const auth: FpElevatorWorldCollisionAuth = {
      buildingOriginX: 0,
      buildingOriginZ: 0,
      maxLevel: 2,
      latestCars: new Map([
        [
          movingShaftKey,
          car({
            shaftKey: movingShaftKey,
            plateX: 0,
            plateZ: 0,
            cabFloorY,
            currentLevel: 1,
            moveFromLevel: 1,
            moveToLevel: 2,
            moveU: 0.55,
            phase: ELEVATOR_PHASE_MOVING,
            doorOpen01: 0,
            doorFace: 0,
          }),
        ],
      ]),
      layoutByKey: new Map([[movingShaftKey, movingLayout]]),
      landingByRowKey: new Map([[landing.rowKey, landing]]),
      feetYForLayout,
    };
    const baseline = collectHits(auth, 0.7, 2.4, -0.8, 0.8).filter(
      (b) => b.max[1] - b.min[1] > 1.5,
    );
    const hits: CollisionAabb[] = [];
    visitFpElevatorWorldCollisionAabbsInXZ(
      auth,
      0.7,
      2.4,
      -0.8,
      0.8,
      (aabb) => hits.push(aabb),
      { bodyX: 0, bodyFeetY: cabFloorY + 3.4, bodyZ: 0 },
    );
    const lowBand = hits.filter((b) => b.max[1] - b.min[1] > 1.5);
    expect(baseline.length).toBeGreaterThan(0);
    expect(lowBand.length).toBe(baseline.length);
    expect(lowBand.length).toBeGreaterThan(0);
  });
});

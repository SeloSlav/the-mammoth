import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  applyStairRuntimeBlockerOverlay,
  applyStairRuntimeWalkSuppressMasks,
  buildStairRuntimeOverlayForBuilding,
  parseBuildingDoc,
  parseFloorDoc,
  parseStairWellDef,
  sampleRuntimeStairSupportTopY,
  type CollisionAabb,
} from "./index.js";

function testBuildingAndFloor() {
  const building = parseBuildingDoc({
    id: "b",
    version: 1,
    floorRefs: [
      { levelIndex: 1, floorDocId: "f" },
      { levelIndex: 2, floorDocId: "f" },
    ],
  });
  const floor = parseFloorDoc({
    id: "f",
    version: 1,
    objects: [
      {
        id: "corridor_01",
        prefabId: "corridor_main",
        position: [3.8, 0, 0],
        scale: [3.6, 3.2, 4.4],
      },
      {
        id: "stair_01",
        prefabId: "stair_well_a",
        position: [0, 0, 0],
        scale: [4, DEFAULT_BUILDING_FLOOR_SPACING_M, 4],
      },
    ],
  });
  return { building, floor };
}

function aabb(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): CollisionAabb {
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

describe("stairRuntimeOverlay", () => {
  it("suppresses stale baked stairwell blockers and replaces them with runtime blockers", () => {
    const { building, floor } = testBuildingAndFloor();
    const overlay = buildStairRuntimeOverlayForBuilding(
      building,
      () => floor,
      parseStairWellDef({ id: "stairs", version: 1 }),
      DEFAULT_BUILDING_FLOOR_SPACING_M,
    );
    const mask = overlay.blockerSuppressMasks[0]!;
    const stale = aabb(
      mask.min[0] + 0.1,
      mask.min[1] + 0.1,
      mask.min[2] + 0.1,
      mask.max[0] - 0.1,
      mask.max[1] - 0.1,
      mask.max[2] - 0.1,
    );
    const outside = aabb(mask.max[0] + 1, mask.min[1], mask.min[2], mask.max[0] + 2, mask.max[1], mask.max[2]);
    const applied = applyStairRuntimeBlockerOverlay([stale, outside], overlay);

    expect(applied).not.toContainEqual(stale);
    expect(applied).toContainEqual(outside);
    expect(applied.length).toBeGreaterThan(overlay.blockerReplacementAabbs.length);
  });

  it("provides smooth support across a stair flight", () => {
    const { building, floor } = testBuildingAndFloor();
    const overlay = buildStairRuntimeOverlayForBuilding(
      building,
      () => floor,
      parseStairWellDef({ id: "stairs", version: 1 }),
      DEFAULT_BUILDING_FLOOR_SPACING_M,
    );
    const slope = overlay.supportSurfaces.find(
      (surface) =>
        surface.kind === "slope" &&
        Math.abs(surface.yAtAlongMax - surface.yAtAlongMin) > 0.02,
    );
    expect(slope).toBeDefined();
    if (!slope || slope.kind !== "slope") return;

    const midAcrossZ = (slope.minZ + slope.maxZ) * 0.5;
    const midAcrossX = (slope.minX + slope.maxX) * 0.5;
    const t0 = slope.alongMin + (slope.alongMax - slope.alongMin) * 0.2;
    const t1 = slope.alongMin + (slope.alongMax - slope.alongMin) * 0.8;
    const low = sampleRuntimeStairSupportTopY(
      [slope],
      slope.axis === "x" ? t0 : midAcrossX,
      slope.axis === "x" ? midAcrossZ : t0,
      4.5,
      { footRadiusXZ: 0.01 },
    );
    const high = sampleRuntimeStairSupportTopY(
      [slope],
      slope.axis === "x" ? t1 : midAcrossX,
      slope.axis === "x" ? midAcrossZ : t1,
      4.5,
      { footRadiusXZ: 0.01 },
    );

    expect(Number.isFinite(low)).toBe(true);
    expect(Number.isFinite(high)).toBe(true);
    expect(high).toBeGreaterThan(low);
  });

  it("updates runtime support heights from stairwell authoring transforms without rebaking walk AABBs", () => {
    const { building, floor } = testBuildingAndFloor();
    const baseOverlay = buildStairRuntimeOverlayForBuilding(
      building,
      () => floor,
      parseStairWellDef({ id: "stairs", version: 1 }),
      DEFAULT_BUILDING_FLOOR_SPACING_M,
    );
    const movedOverlay = buildStairRuntimeOverlayForBuilding(
      building,
      () => floor,
      parseStairWellDef({
        id: "stairs",
        version: 1,
        groundPartTransforms: {
          stair_flight_lower: {
            position: [0, 0.25, 0],
          },
        },
      }),
      DEFAULT_BUILDING_FLOOR_SPACING_M,
    );
    const n = Math.min(
      baseOverlay.supportSurfaces.length,
      movedOverlay.supportSurfaces.length,
    );
    let baseSlopeIndex = -1;
    for (let i = 0; i < n; i++) {
      const surface = baseOverlay.supportSurfaces[i];
      const movedSurface = movedOverlay.supportSurfaces[i];
      if (surface?.kind !== "slope" || movedSurface?.kind !== "slope") continue;
      if (Math.abs(surface.yAtAlongMax - surface.yAtAlongMin) <= 0.02) continue;
      if (Math.abs(movedSurface.yAtAlongMin - surface.yAtAlongMin) > 0.01) {
        baseSlopeIndex = i;
        break;
      }
    }
    expect(baseSlopeIndex).toBeGreaterThanOrEqual(0);
    const baseSlope = baseOverlay.supportSurfaces[baseSlopeIndex];
    const movedSlope = movedOverlay.supportSurfaces[baseSlopeIndex];
    expect(baseSlope?.kind).toBe("slope");
    expect(movedSlope?.kind).toBe("slope");
    if (!baseSlope || !movedSlope || baseSlope.kind !== "slope" || movedSlope.kind !== "slope") {
      return;
    }

    expect(movedSlope.yAtAlongMin - baseSlope.yAtAlongMin).toBeCloseTo(0.25, 4);
    expect(movedSlope.yAtAlongMax - baseSlope.yAtAlongMax).toBeCloseTo(0.25, 4);
  });

  it("filters baked walk surfaces inside the stairwell while preserving outside support", () => {
    const { building, floor } = testBuildingAndFloor();
    const overlay = buildStairRuntimeOverlayForBuilding(
      building,
      () => floor,
      parseStairWellDef({ id: "stairs", version: 1 }),
      DEFAULT_BUILDING_FLOOR_SPACING_M,
    );
    const mask = overlay.walkSuppressMasks[0]!;
    const bakedInside = aabb(
      mask.min[0] + 0.05,
      mask.min[1] + 0.05,
      mask.min[2] + 0.05,
      mask.max[0] - 0.05,
      mask.min[1] + 0.15,
      mask.max[2] - 0.05,
    );
    const bakedOutside = aabb(
      mask.max[0] + 1,
      mask.min[1],
      mask.min[2],
      mask.max[0] + 2,
      mask.min[1] + 0.1,
      mask.max[2],
    );
    expect(applyStairRuntimeWalkSuppressMasks([bakedInside, bakedOutside], overlay)).toEqual([
      bakedOutside,
    ]);
  });
});

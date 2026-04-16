import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type FloorObject = {
  id: string;
  prefabId: string;
  position: [number, number, number];
  scale?: [number, number, number];
};

type FloorDocLike = {
  objects: FloorObject[];
  metadata?: {
    core_spacing_m?: number;
  };
};

type Rect = {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
};

function readTypicalFloor(): FloorDocLike {
  return JSON.parse(
    readFileSync(
      new URL("../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
      "utf8",
    ),
  ) as FloorDocLike;
}

function rectFor(obj: FloorObject): Rect {
  const sx = obj.scale?.[0] ?? 0;
  const sz = obj.scale?.[2] ?? 0;
  return {
    x0: obj.position[0] - sx * 0.5,
    x1: obj.position[0] + sx * 0.5,
    z0: obj.position[2] - sz * 0.5,
    z1: obj.position[2] + sz * 0.5,
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.z1 <= b.z0 || a.z0 >= b.z1);
}

describe("floor_mamutica_typical layout", () => {
  it("never places apartments through stair or elevator core footprints", () => {
    const floor = readTypicalFloor();
    const eastUnits = floor.objects.filter((obj) => obj.id.startsWith("unit_e_"));
    const westUnits = floor.objects.filter((obj) => obj.id.startsWith("unit_w_"));
    const stairs = floor.objects.filter((obj) => obj.prefabId === "stair_well_a");
    const elevators = floor.objects.filter((obj) => obj.prefabId === "elevator_shaft_a");

    for (const stair of stairs) {
      const stairRect = rectFor(stair);
      for (const unit of eastUnits) {
        expect(rectsOverlap(rectFor(unit), stairRect)).toBe(false);
      }
    }

    for (const elevator of elevators) {
      const elevRect = rectFor(elevator);
      for (const unit of westUnits) {
        expect(rectsOverlap(rectFor(unit), elevRect)).toBe(false);
      }
    }
  });

  it("keeps usable north/south clearance around every stair core", () => {
    const floor = readTypicalFloor();
    const eastUnits = floor.objects.filter((obj) => obj.id.startsWith("unit_e_"));
    const stairs = floor.objects
      .filter((obj) => obj.prefabId === "stair_well_a")
      .sort((a, b) => a.position[2] - b.position[2]);

    for (const stair of stairs) {
      const stairRect = rectFor(stair);
      const overlappingUnitsX = eastUnits
        .map((unit) => rectFor(unit))
        .filter((unitRect) => !(unitRect.x1 <= stairRect.x0 || unitRect.x0 >= stairRect.x1));

      const southGap = Math.min(
        ...overlappingUnitsX
          .filter((unitRect) => unitRect.z1 <= stairRect.z0)
          .map((unitRect) => stairRect.z0 - unitRect.z1),
      );
      const northGap = Math.min(
        ...overlappingUnitsX
          .filter((unitRect) => unitRect.z0 >= stairRect.z1)
          .map((unitRect) => unitRect.z0 - stairRect.z1),
      );

      expect(southGap).toBeGreaterThanOrEqual(2.5);
      expect(northGap).toBeGreaterThanOrEqual(2.5);
    }
  });
});

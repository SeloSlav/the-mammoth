import { bench, describe } from "vitest";
import type {
  BuildingCorridorPvsDoorEntry,
  BuildingStoreyUnitBoundsEntry,
} from "@the-mammoth/world";
import { createFpSessionCorridorPvsContext } from "./fpSessionCorridorPvs.js";

type PvsFrame = Parameters<
  ReturnType<typeof createFpSessionCorridorPvsContext>["resolveSnapshot"]
>[0];

const STOREY_COUNT = 19;
const UNITS_PER_STOREY = 32;
const FLOOR_SPACING_M = 3.2;

function buildTowerFixture(): {
  doors: BuildingCorridorPvsDoorEntry[];
  units: BuildingStoreyUnitBoundsEntry[];
} {
  const doors: BuildingCorridorPvsDoorEntry[] = [];
  const units: BuildingStoreyUnitBoundsEntry[] = [];
  for (let level = 1; level <= STOREY_COUNT; level++) {
    for (let unit = 0; unit < UNITS_PER_STOREY; unit++) {
      const side = unit % 2 === 0 ? -1 : 1;
      const along = Math.floor(unit / 2) * 4 - 30;
      const unitId = `unit_${unit.toString().padStart(3, "0")}`;
      const unitKey = `floor|${level}|${unitId}`;
      doors.push({
        unitKey,
        unitId,
        level,
        open01: unit % 5 === 0 ? 1 : 0,
        isResidentialUnitDoor: true,
        hingeX: side * 3,
        hingeZ: along,
        tangentX: 0,
        tangentZ: 1,
        panelWidthM: 1.2,
      });
      units.push({
        unitKey,
        unitId,
        level,
        centerX: side * 8,
        centerZ: along,
      });
    }
  }
  return { doors, units };
}

const fixture = buildTowerFixture();

function createContext() {
  return createFpSessionCorridorPvsContext({
    buildingWorldOriginY: 0,
    floorSpacingM: FLOOR_SPACING_M,
    maxLevel: STOREY_COUNT,
    unitIdForKey: (key) => key.split("|")[2] ?? null,
    getDoorEntriesRevision: () => 1,
    getStoreyUnitBoundsRevision: () => 1,
    collectDoorEntries: () => fixture.doors,
    collectStoreyUnitBounds: () => fixture.units,
  });
}

function framesAlong(input: {
  count: number;
  fromX: number;
  toX: number;
  fromZ: number;
  toZ: number;
  fromFeetY: number;
  toFeetY: number;
  insideResidentialUntil?: number;
  insideLightingUntil?: number;
}): PvsFrame[] {
  const frames: PvsFrame[] = [];
  for (let i = 0; i < input.count; i++) {
    const t = input.count <= 1 ? 1 : i / (input.count - 1);
    frames.push({
      feetY: input.fromFeetY + (input.toFeetY - input.fromFeetY) * t,
      cameraX: input.fromX + (input.toX - input.fromX) * t,
      cameraZ: input.fromZ + (input.toZ - input.fromZ) * t,
      viewDirX: 0,
      viewDirZ: -1,
      insideResidentialUnit: i < (input.insideResidentialUntil ?? 0),
      insideApartmentInteriorLightingZone: i < (input.insideLightingUntil ?? input.count),
      containingUnitKey:
        i < (input.insideResidentialUntil ?? 0) ? "floor|2|unit_000" : null,
      retainedUnitKey: "floor|2|unit_000",
    });
  }
  return frames;
}

const scenarios = {
  "apartment -> hallway": framesAlong({
    count: 120,
    fromX: -8,
    toX: 0,
    fromZ: 0,
    toZ: 0,
    fromFeetY: 3.3,
    toFeetY: 3.3,
    insideResidentialUntil: 72,
  }),
  "hallway -> stairwell": framesAlong({
    count: 150,
    fromX: 0,
    toX: 18,
    fromZ: -22,
    toZ: 22,
    fromFeetY: 3.3,
    toFeetY: 3.3,
    insideLightingUntil: 126,
  }),
  "hallway -> elevator": framesAlong({
    count: 120,
    fromX: 0,
    toX: 4,
    fromZ: -18,
    toZ: 0,
    fromFeetY: 3.3,
    toFeetY: 3.3,
  }),
  "elevator -> floor transition": framesAlong({
    count: 180,
    fromX: 4,
    toX: 4,
    fromZ: 0,
    toZ: 0,
    fromFeetY: 3.3,
    toFeetY: 6.5,
  }),
  "multi-floor traversal": framesAlong({
    count: 360,
    fromX: 4,
    toX: 4,
    fromZ: 0,
    toZ: 0,
    fromFeetY: 0.1,
    toFeetY: (STOREY_COUNT - 1) * FLOOR_SPACING_M + 0.1,
  }),
} satisfies Record<string, PvsFrame[]>;

describe("corridor PVS traversal", () => {
  for (const [name, frames] of Object.entries(scenarios)) {
    const ctx = createContext();
    bench(name, () => {
      let visibleUnits = 0;
      for (let i = 0; i < frames.length; i++) {
        visibleUnits += ctx.resolveSnapshot(frames[i]!).visible.unitKeys.size;
      }
      void visibleUnits;
    });
  }
});

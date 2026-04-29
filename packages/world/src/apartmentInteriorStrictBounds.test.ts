import { describe, expect, it } from "vitest";
import { APARTMENT_DOOR_TEMPLATES } from "./generatedApartmentDoors.js";
import type { UnitEntryFace } from "./unitEntryAdjacency.js";

const DEPTH_M = 13;
const UNIT_HALF_WIDTH_M = 3.3;
const PROP_WALL_GAP_M = 0.06;

const BED_HALF_X_M = 1.09;
const BED_HALF_Z_M = 0.61;
const FOOTLOCKER_HALF_X_M = 0.43;
const FOOTLOCKER_HALF_Z_M = 0.54;
const WARDROBE_HALF_X_M = 0.26;
const WARDROBE_HALF_Z_M = 0.56;

const BED_CENTER_FROM_BACK_WALL_M = 1.62;
const FOOTLOCKER_CENTER_FROM_BACK_WALL_M = 2.88;
const BED_CENTER_Z_OFFSET_M = -1.08;
const WARDROBE_CENTER_FROM_BACK_WALL_M = 0.72;
const WARDROBE_CENTER_Z_OFFSET_M = 2.34;
const Z_EDGE_M = BED_HALF_Z_M + PROP_WALL_GAP_M;

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Rect = { x: number; z: number; halfX: number; halfZ: number };

function isResidential(unitId: string): boolean {
  return unitId.startsWith("unit_e_") || unitId.startsWith("unit_w_");
}

function boundsForDoor(t: {
  face: UnitEntryFace;
  hingeX: number;
  hingeZ: number;
}): Bounds {
  if (t.face === "w") {
    return {
      minX: t.hingeX - DEPTH_M,
      maxX: t.hingeX - 0.08,
      minZ: t.hingeZ - UNIT_HALF_WIDTH_M,
      maxZ: t.hingeZ + UNIT_HALF_WIDTH_M,
    };
  }
  if (t.face === "e") {
    return {
      minX: t.hingeX + 0.08,
      maxX: t.hingeX + DEPTH_M,
      minZ: t.hingeZ - UNIT_HALF_WIDTH_M,
      maxZ: t.hingeZ + UNIT_HALF_WIDTH_M,
    };
  }
  return {
    minX: t.hingeX - UNIT_HALF_WIDTH_M,
    maxX: t.hingeX + UNIT_HALF_WIDTH_M,
    minZ: t.hingeZ - DEPTH_M,
    maxZ: t.hingeZ + UNIT_HALF_WIDTH_M,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function furnitureRects(t: {
  face: UnitEntryFace;
  hingeX: number;
  hingeZ: number;
}): { bed: Rect; footlocker: Rect; wardrobe: Rect } {
  const b = boundsForDoor(t);
  const cz = (b.minZ + b.maxZ) * 0.5;
  const bedZ = clamp(
    cz + BED_CENTER_Z_OFFSET_M,
    b.minZ + Z_EDGE_M,
    b.maxZ - Z_EDGE_M,
  );
  const wardrobeZ = clamp(
    cz + WARDROBE_CENTER_Z_OFFSET_M,
    b.minZ + Z_EDGE_M,
    b.maxZ - Z_EDGE_M,
  );
  if (t.face === "w") {
    return {
      bed: {
        x: clamp(
          b.minX + BED_CENTER_FROM_BACK_WALL_M,
          b.minX + BED_HALF_X_M + PROP_WALL_GAP_M,
          b.maxX - BED_HALF_X_M - PROP_WALL_GAP_M,
        ),
        z: bedZ,
        halfX: BED_HALF_X_M,
        halfZ: BED_HALF_Z_M,
      },
      footlocker: {
        x: clamp(
          b.minX + FOOTLOCKER_CENTER_FROM_BACK_WALL_M,
          b.minX + FOOTLOCKER_HALF_X_M + PROP_WALL_GAP_M,
          b.maxX - FOOTLOCKER_HALF_X_M - PROP_WALL_GAP_M,
        ),
        z: bedZ,
        halfX: FOOTLOCKER_HALF_X_M,
        halfZ: FOOTLOCKER_HALF_Z_M,
      },
      wardrobe: {
        x: clamp(
          b.minX + WARDROBE_CENTER_FROM_BACK_WALL_M,
          b.minX + WARDROBE_HALF_X_M + PROP_WALL_GAP_M,
          b.maxX - WARDROBE_HALF_X_M - PROP_WALL_GAP_M,
        ),
        z: wardrobeZ,
        halfX: WARDROBE_HALF_X_M,
        halfZ: WARDROBE_HALF_Z_M,
      },
    };
  }
  return {
    bed: {
      x: clamp(
        b.maxX - BED_CENTER_FROM_BACK_WALL_M,
        b.minX + BED_HALF_X_M + PROP_WALL_GAP_M,
        b.maxX - BED_HALF_X_M - PROP_WALL_GAP_M,
      ),
      z: bedZ,
      halfX: BED_HALF_X_M,
      halfZ: BED_HALF_Z_M,
    },
    footlocker: {
      x: clamp(
        b.maxX - FOOTLOCKER_CENTER_FROM_BACK_WALL_M,
        b.minX + FOOTLOCKER_HALF_X_M + PROP_WALL_GAP_M,
        b.maxX - FOOTLOCKER_HALF_X_M - PROP_WALL_GAP_M,
      ),
      z: bedZ,
      halfX: FOOTLOCKER_HALF_X_M,
      halfZ: FOOTLOCKER_HALF_Z_M,
    },
    wardrobe: {
      x: clamp(
        b.maxX - WARDROBE_CENTER_FROM_BACK_WALL_M,
        b.minX + WARDROBE_HALF_X_M + PROP_WALL_GAP_M,
        b.maxX - WARDROBE_HALF_X_M - PROP_WALL_GAP_M,
      ),
      z: wardrobeZ,
      halfX: WARDROBE_HALF_X_M,
      halfZ: WARDROBE_HALF_Z_M,
    },
  };
}

function expectRectInside(label: string, rect: Rect, b: Bounds): void {
  expect(rect.x - rect.halfX, `${label} minX`).toBeGreaterThanOrEqual(
    b.minX + PROP_WALL_GAP_M,
  );
  expect(rect.x + rect.halfX, `${label} maxX`).toBeLessThanOrEqual(
    b.maxX - PROP_WALL_GAP_M,
  );
  expect(rect.z - rect.halfZ, `${label} minZ`).toBeGreaterThanOrEqual(
    b.minZ + PROP_WALL_GAP_M,
  );
  expect(rect.z + rect.halfZ, `${label} maxZ`).toBeLessThanOrEqual(
    b.maxZ - PROP_WALL_GAP_M,
  );
}

describe("strict apartment interiors", () => {
  it("residential unit bounds do not overlap adjacent units on the same side", () => {
    for (const set of APARTMENT_DOOR_TEMPLATES) {
      const rows = set.templates
        .filter((t) => isResidential(t.unitId))
        .map((t) => ({ template: t, bounds: boundsForDoor(t) }))
        .sort((a, b) => a.template.face.localeCompare(b.template.face) || a.template.hingeZ - b.template.hingeZ);

      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1]!;
        const b = rows[i]!;
        if (a.template.face !== b.template.face) continue;
        expect(
          a.bounds.maxZ <= b.bounds.minZ || b.bounds.maxZ <= a.bounds.minZ,
          `${a.template.unitId} overlaps ${b.template.unitId}`,
        ).toBe(true);
      }
    }
  });

  it("furniture footprints stay inside strict residential unit interiors", () => {
    let checked = 0;
    for (const set of APARTMENT_DOOR_TEMPLATES) {
      for (const t of set.templates) {
        if (!isResidential(t.unitId)) continue;
        const b = boundsForDoor(t);
        const rects = furnitureRects(t);
        expectRectInside(`${t.unitId} bed`, rects.bed, b);
        expectRectInside(`${t.unitId} footlocker`, rects.footlocker, b);
        expectRectInside(`${t.unitId} wardrobe`, rects.wardrobe, b);
        checked += 1;
      }
    }
    expect(checked).toBe(32);
  });
});

import { describe, expect, it } from "vitest";
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import {
  apartmentDoorTemplatesForFloor,
  entryDoorTangentHalfFromOverlap,
  entryDoorYRangeForShell,
  UNIT_ENTRY_DOOR_H,
  UNIT_ENTRY_DOOR_W,
} from "./unitEntryAdjacency.js";

function unit(
  id: string,
  x: number,
  z: number,
  sx: number,
  sz: number,
  sy = 2.6,
  y = 0,
): PlacedObject {
  return {
    id,
    prefabId: "apartmentUnitShell",
    position: [x, y, z],
    rotationDeg: [0, 0, 0],
    scale: [sx, sy, sz],
  } as PlacedObject;
}

function corridor(id: string, x: number, z: number, sx: number, sz: number): PlacedObject {
  return {
    id,
    prefabId: "corridorFloorShell",
    position: [x, 0, z],
    rotationDeg: [0, 0, 0],
    scale: [sx, 0.25, sz],
  } as PlacedObject;
}

function floorDoc(objects: PlacedObject[]): FloorDoc {
  return {
    id: "test",
    version: 1,
    footprint: { sizeXZ: [40, 40] },
    objects,
  } as FloorDoc;
}

describe("entryDoorTangentHalfFromOverlap", () => {
  it("returns undefined for spans too small to fit a door", () => {
    expect(entryDoorTangentHalfFromOverlap(0, 0.3)).toBeUndefined();
  });

  it("clamps to UNIT_ENTRY_DOOR_W/2 for wide spans", () => {
    const h = entryDoorTangentHalfFromOverlap(-2, 2);
    expect(h).toBeCloseTo(UNIT_ENTRY_DOOR_W * 0.5);
  });

  it("uses overlap minus margin for narrow usable spans", () => {
    // span 1.0 → avail = 0.5 - 0.08 = 0.42 → clamped to 0.42
    const h = entryDoorTangentHalfFromOverlap(0, 1.0);
    expect(h).toBeCloseTo(0.42);
  });
});

describe("entryDoorYRangeForShell", () => {
  it("produces a UNIT_ENTRY_DOOR_H-tall opening inside the shell", () => {
    const { yDoor0, yDoor1 } = entryDoorYRangeForShell(3.0);
    expect(yDoor1 - yDoor0).toBeGreaterThan(0.4);
    expect(yDoor1 - yDoor0).toBeLessThanOrEqual(UNIT_ENTRY_DOOR_H);
  });

  it("clamps to sub-shell height when shell is short", () => {
    const { yDoor0, yDoor1 } = entryDoorYRangeForShell(1.2);
    expect(yDoor1).toBeLessThanOrEqual(1.2 * 0.5);
    expect(yDoor0).toBeGreaterThanOrEqual(-1.2 * 0.5);
  });
});

describe("apartmentDoorTemplatesForFloor", () => {
  it("emits no template when no corridor is adjacent", () => {
    const f = floorDoc([unit("a", 0, 0, 4, 4)]);
    expect(apartmentDoorTemplatesForFloor(f)).toEqual([]);
  });

  it("emits a W-face template when corridor touches unit's west edge", () => {
    // Unit centered at (2, 0, 0), width 4 → west edge at x=0.
    // Corridor centered at (-1, 0, 0), width 2 → east edge at x=0.
    const f = floorDoc([
      unit("u1", 2, 0, 4, 4),
      corridor("c1", -1, 0, 2, 4),
    ]);
    const out = apartmentDoorTemplatesForFloor(f);
    expect(out).toHaveLength(1);
    const t = out[0]!;
    expect(t.face).toBe("w");
    expect(t.hingeX).toBeCloseTo(0); // x of unit west edge
    expect(t.unitId).toBe("u1");
    expect(t.panelWidthM).toBeGreaterThan(0);
    expect(t.panelWidthM).toBeLessThanOrEqual(UNIT_ENTRY_DOOR_W);
  });

  it("emits an N-face template when corridor touches unit's north edge", () => {
    // Unit centered at (0, 0, -2), depth 4 → north (+z) edge at z=0.
    // Corridor centered at (0, 0, 1), depth 2 → south (-z) edge at z=0.
    const f = floorDoc([
      unit("u1", 0, -2, 4, 4),
      corridor("c1", 0, 1, 4, 2),
    ]);
    const out = apartmentDoorTemplatesForFloor(f);
    expect(out).toHaveLength(1);
    expect(out[0]!.face).toBe("n");
  });

  it("assigns distinct templateIds across units", () => {
    const f = floorDoc([
      unit("u1", 2, -1, 4, 2),
      unit("u2", 2, 2, 4, 2),
      corridor("c1", -1, 0, 2, 10),
    ]);
    const out = apartmentDoorTemplatesForFloor(f);
    const ids = new Set(out.map((t) => t.templateId));
    expect(ids.size).toBe(out.length);
    expect(out.length).toBe(2);
  });
});

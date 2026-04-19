import { describe, expect, it } from "vitest";
import { buildFloorMeshes } from "./floorPlaceholderMeshes.js";
import {
  facadeSeedForUnitFace,
  planUnitExteriorWindowsForFace,
} from "./unitExteriorWindows.js";

describe("planUnitExteriorWindowsForFace", () => {
  const base = {
    vlenX: 8.5,
    vlenZ: 6.2,
    yLo: -1.4,
    yHi: 1.45,
    facadeSalt: 7,
    storyLevelIndex: 3,
    floorDocId: "floor_mamutica_typical",
    placedObjectId: "unit_e_042",
  };

  it("is deterministic for identical inputs", () => {
    const a = planUnitExteriorWindowsForFace({ ...base, face: "e" });
    const b = planUnitExteriorWindowsForFace({ ...base, face: "e" });
    expect(a).toEqual(b);
  });

  it("changes layout when facadeSalt changes", () => {
    const a = planUnitExteriorWindowsForFace({ ...base, face: "e", facadeSalt: 1 });
    const b = planUnitExteriorWindowsForFace({ ...base, face: "e", facadeSalt: 2 });
    expect(a.count).toBeGreaterThan(0);
    expect(b.count).toBeGreaterThan(0);
    const sameSegments =
      a.holesEw.length === b.holesEw.length &&
      a.holesEw.every(
        (h, i) =>
          h.z0 === b.holesEw[i]!.z0 &&
          h.z1 === b.holesEw[i]!.z1 &&
          h.y0 === b.holesEw[i]!.y0 &&
          h.y1 === b.holesEw[i]!.y1,
      );
    expect(sameSegments && a.tintId === b.tintId).toBe(false);
  });

  it("changes when placedObjectId changes", () => {
    const a = planUnitExteriorWindowsForFace({ ...base, face: "w", placedObjectId: "unit_w_001" });
    const b = planUnitExteriorWindowsForFace({ ...base, face: "w", placedObjectId: "unit_w_002" });
    expect(a.count).toBeGreaterThan(0);
    expect(b.count).toBeGreaterThan(0);
    expect(a.holesEw).not.toEqual(b.holesEw);
  });

  it("produces north/south holes on n/s faces", () => {
    const n = planUnitExteriorWindowsForFace({ ...base, face: "n" });
    expect(n.holesNs.length).toBe(n.count);
    expect(n.holesEw.length).toBe(0);
  });
});

describe("facadeSeedForUnitFace", () => {
  it("differs by face for same unit", () => {
    const a = facadeSeedForUnitFace({
      facadeSalt: 1,
      storyLevelIndex: 2,
      floorDocId: "f",
      placedObjectId: "u",
      face: "e",
    });
    const b = facadeSeedForUnitFace({
      facadeSalt: 1,
      storyLevelIndex: 2,
      floorDocId: "f",
      placedObjectId: "u",
      face: "n",
    });
    expect(a).not.toBe(b);
  });
});

describe("buildFloorMeshes unit exterior windows", () => {
  it("cuts east shell wall into fragments when unit has exterior facade windows", () => {
    const root = buildFloorMeshes(
      {
        id: "win_test_floor",
        version: 1,
        objects: [
          {
            id: "corridor_main",
            prefabId: "corridor_segment_a",
            position: [0, 1.605, 0],
            scale: [3.85, 3.05, 40],
          },
          {
            id: "unit_e",
            prefabId: "apartment_unit_small_a",
            position: [6.425, 1.605, 0],
            scale: [9, 3.05, 7.38],
          },
        ],
      },
      { storyLevelIndex: 2, facadeSalt: 99 },
    );

    const names: string[] = [];
    root.traverse((o) => {
      if (o.name.startsWith("shell_wall_e")) names.push(o.name);
    });
    expect(names.some((n) => n.includes("_y_") || n.includes("_z_"))).toBe(true);
    expect(names.some((n) => n.endsWith("_solid"))).toBe(false);

    let glass = 0;
    root.traverse((o) => {
      if (o.name.startsWith("unit_exterior_glass_")) glass += 1;
    });
    expect(glass).toBeGreaterThan(0);
  });
});

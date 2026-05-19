import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import { describe, expect, it } from "vitest";
import { buildFloorMeshes } from "./floorPlaceholderMeshes.js";
import { parseBuildingDoc } from "./index.js";
import {
  facadeSeedForUnitFace,
  planUnitExteriorWindowsForFace,
  unitShellFacesForExteriorWindows,
} from "./unitExteriorWindows.js";
import { exteriorFacesForPlacedObjectInFloor } from "./exteriorFaceExposure.js";
import {
  buildUnitExteriorWindowSealBlockersForBuilding,
  buildUnitExteriorWindowSillLedgeAABBsForBuilding,
} from "./unitExteriorWindowBlockers.js";

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

  it("shortens openings from the bottom while keeping the head height", () => {
    const p = planUnitExteriorWindowsForFace({ ...base, face: "e" });
    expect(p.holesEw.length).toBeGreaterThan(0);
    const first = p.holesEw[0]!;
    const legacyY0 = base.yLo + 0.55;
    const legacyY1 = Math.min(base.yHi - 0.06, legacyY0 + 1.78);
    expect(first.y1).toBeCloseTo(legacyY1);
    expect(first.y0).toBeCloseTo(legacyY0 + 0.36);
    expect(first.y1 - first.y0).toBeLessThan(legacyY1 - legacyY0);
  });

  it("allows up to four tangent windows on wide façades (deterministic draw)", () => {
    let foundFour = false;
    for (let facadeSalt = 0; facadeSalt < 500; facadeSalt++) {
      const p = planUnitExteriorWindowsForFace({ ...base, face: "e", facadeSalt });
      expect(p.count).toBeGreaterThanOrEqual(0);
      expect(p.count).toBeLessThanOrEqual(4);
      if (p.count === 4) {
        expect(p.holesEw).toHaveLength(4);
        foundFour = true;
        break;
      }
    }
    expect(foundFour).toBe(true);
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
  it("does not cut north/south façade windows when only those faces read as exposed slots", () => {
    const floor: FloorDoc = {
      id: "gap_faces_mesh",
      version: 1,
      objects: [
        {
          id: "corridor",
          prefabId: "corridor_segment_a",
          position: [0, 0, 0],
          scale: [4, 3, 30],
        },
        {
          id: "unit_a",
          prefabId: "apartment_unit_small_a",
          position: [6.5, 0, -10],
          scale: [8, 3, 8],
        },
      ],
    };
    expect(exteriorFacesForPlacedObjectInFloor(floor, floor.objects[1]!)).toContain("n");
    const unitObj = floor.objects[1]!;
    expect(
      unitShellFacesForExteriorWindows(exteriorFacesForPlacedObjectInFloor(floor, unitObj)),
    ).toEqual(["e"]);

    const root = buildFloorMeshes(floor, { storyLevelIndex: 2, facadeSalt: 42 });
    const glassNames: string[] = [];
    root.traverse((o) => {
      if (o.name.startsWith("unit_exterior_glass_")) glassNames.push(o.name);
    });
    expect(glassNames.length).toBeGreaterThan(0);
    expect(glassNames.every((n) => !n.includes("_glass_n_") && !n.includes("_glass_s_"))).toBe(true);
  });

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

  it("adds analytic window seal blockers without changing floor meshes", () => {
    const building = parseBuildingDoc({
      id: "b",
      version: 1,
      worldOrigin: [0, 0, 0],
      floorRefs: [{ levelIndex: 2, floorDocId: "win_test_floor" }],
    });
    const floor: FloorDoc = {
      id: "win_test_floor",
      version: 1,
      objects: [
        {
          id: "unit_e",
          prefabId: "apartment_unit_small_a",
          position: [6.425, 1.605, 0],
          scale: [9, 3.05, 7.38],
        },
      ],
    };
    const seals = buildUnitExteriorWindowSealBlockersForBuilding(
      building,
      () => floor,
      60 / 19,
    );
    expect(seals.length).toBeGreaterThan(0);
    const px = 6.425;
    const hx = 9 * 0.5;
    const eastShellOuterX = px + hx;
    const eastWindowSlabs = seals.filter((b) => {
      const dx = b.max[0] - b.min[0];
      return dx > 0.78 && dx < 0.98;
    });
    expect(eastWindowSlabs.length).toBeGreaterThan(0);
    expect(eastWindowSlabs.some((s) => s.max[0] >= eastShellOuterX + 0.16)).toBe(true);
    expect(eastWindowSlabs.some((s) => s.min[0] < eastShellOuterX - 0.52)).toBe(true);

    const sills = buildUnitExteriorWindowSillLedgeAABBsForBuilding(
      building,
      () => floor,
      60 / 19,
    );
    expect(sills.length).toBeGreaterThan(0);
    expect(sills.some((s) => Math.abs(s.min[0] - eastShellOuterX) < 1e-4)).toBe(true);
    const sillTops = sills.map((b) => b.max[1] - b.min[1]);
    expect(Math.min(...sillTops)).toBeLessThan(0.15);
    const wideX = sills.filter((b) => b.max[0] - b.min[0] > 0.2);
    expect(wideX.length).toBeGreaterThan(0);

    const sillsWalk = buildUnitExteriorWindowSillLedgeAABBsForBuilding(
      building,
      () => floor,
      60 / 19,
      { sillLedgeForWalkSurfaces: true },
    );
    expect(sillsWalk.length).toBe(sills.length);
    const maxDxCollision = Math.max(...sills.map((b) => b.max[0] - b.min[0]));
    const maxDxWalk = Math.max(...sillsWalk.map((b) => b.max[0] - b.min[0]));
    expect(maxDxWalk).toBeGreaterThan(maxDxCollision + 0.2);
  });
});

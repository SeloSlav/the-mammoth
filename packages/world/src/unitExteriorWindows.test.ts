import { readFileSync } from "node:fs";
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import { describe, expect, it } from "vitest";
import type { CardinalFace } from "./wallWithDoorCutout.js";
import { buildFloorMeshes } from "./floorPlaceholderMeshes.js";
import { parseBuildingDoc } from "./index.js";
import {
  corridorCapFacesForExteriorWindows,
  exteriorCornerTangentOnNsFace,
  facadeSeedForUnitFace,
  CORRIDOR_CAP_WINDOW_WIDTH_M,
  planCorridorCapExteriorWindow,
  planSmallestLongFacadeWindowVariant,
  planUnitExteriorWindowsForFace,
  unitShellFacesForExteriorWindows,
} from "./unitExteriorWindows.js";
import { exteriorFacesForPlacedObjectInFloor } from "./exteriorFaceExposure.js";
import {
  buildUnitExteriorWindowSealBlockersForBuilding,
  buildUnitExteriorWindowSillLedgeAABBsForBuilding,
} from "./unitExteriorWindowBlockers.js";
import { RESIDENTIAL_UNIT_BALCONY_OVERHANG_M } from "./residentialUnitBalcony.js";
import {
  balconyBayFacadeCladOuterLocalX,
  residentialBalconyBayFrame,
} from "./residentialUnitBalconyShell.js";
import { UNIT_SHELL_WALL_THICKNESS_M } from "./unitExteriorWindows.js";

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

  it("puts one corner N/S window matching the narrowest panel from the densest long-façade variant", () => {
    const e = planUnitExteriorWindowsForFace({ ...base, face: "e" });
    const n = planUnitExteriorWindowsForFace({ ...base, face: "n" });
    expect(n.count).toBe(1);
    expect(n.holesNs).toHaveLength(1);
    expect(n.holesEw).toHaveLength(0);
    const smallest = planSmallestLongFacadeWindowVariant({ ...base, face: "e" });
    expect(smallest.count).toBeGreaterThan(1);
    const ref = smallest.holesEw.reduce((best, h) => {
      const w = Math.abs(h.z1 - h.z0);
      const bw = Math.abs(best.z1 - best.z0);
      return w < bw ? h : best;
    });
    const hole = n.holesNs[0]!;
    expect(hole.y0).toBeCloseTo(ref.y0, 4);
    expect(hole.y1).toBeCloseTo(ref.y1, 4);
    expect(hole.x1 - hole.x0).toBeCloseTo(Math.abs(ref.z1 - ref.z0), 4);
    expect(n.tintId).toBe(e.tintId);
    const tMax = base.vlenX * 0.5 - 0.35;
    expect(hole.x1).toBeCloseTo(tMax, 2);
  });

  it("places west-wing corner windows on the −X end of the short wall", () => {
    const w = planUnitExteriorWindowsForFace({
      ...base,
      face: "s",
      placedObjectId: "unit_w_012",
    });
    expect(w.count).toBe(1);
    const hole = w.holesNs[0]!;
    const tMin = -base.vlenX * 0.5 + 0.35;
    expect(hole.x0).toBeCloseTo(tMin, 2);
  });

  it("centers east-wing balcony N/S windows on the balcony bay only", () => {
    const sx = 9;
    const wt = UNIT_SHELL_WALL_THICKNESS_M;
    const hx = sx * 0.5;
    const vlenX = sx - 2 * wt;
    const bay = RESIDENTIAL_UNIT_BALCONY_OVERHANG_M;
    const wallSpanX = { min: -hx, max: hx + bay };
    const s = planUnitExteriorWindowsForFace({
      face: "s",
      vlenX,
      vlenZ: 7.1,
      yLo: base.yLo,
      yHi: base.yHi,
      facadeSalt: base.facadeSalt,
      storyLevelIndex: base.storyLevelIndex,
      floorDocId: base.floorDocId,
      placedObjectId: "unit_e_003",
      wallSpanX,
    });
    expect(s.count).toBe(1);
    const hole = s.holesNs[0]!;
    const balconyLo = hx + 0.35;
    const balconyHi = wallSpanX.max - 0.35;
    const xMid = (balconyLo + balconyHi) * 0.5;
    expect((hole.x0 + hole.x1) * 0.5).toBeCloseTo(xMid, 2);
    expect(hole.x0).toBeGreaterThan(balconyLo - 1e-4);
    expect(hole.x1).toBeLessThan(balconyHi + 1e-4);
    expect(hole.x0).toBeGreaterThan(-hx + 0.35);
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

describe("planCorridorCapExteriorWindow", () => {
  const base = {
    vlenX: 3.63,
    yLo: -1.415,
    yHi: 1.415,
    facadeSalt: 3,
    storyLevelIndex: 12,
    floorDocId: "floor_mamutica_typical",
    placedObjectId: "corridor_main",
  };

  it("places a tall narrow centered slit, not a unit E/W panel", () => {
    const unitEw = planUnitExteriorWindowsForFace({
      face: "e",
      vlenX: 8.78,
      vlenZ: 7.1,
      yLo: base.yLo,
      yHi: base.yHi,
      facadeSalt: base.facadeSalt,
      storyLevelIndex: base.storyLevelIndex,
      floorDocId: base.floorDocId,
      placedObjectId: "unit_e_003",
    });
    const n = planCorridorCapExteriorWindow({ ...base, face: "n" });
    const s = planCorridorCapExteriorWindow({ ...base, face: "s" });
    expect(n.count).toBe(1);
    expect(s.count).toBe(1);
    const hole = n.holesNs[0]!;
    const unitHole = unitEw.holesEw[0]!;
    const tMin = -base.vlenX * 0.5 + 0.35;
    const tMax = base.vlenX * 0.5 - 0.35;
    const xMid = (tMin + tMax) * 0.5;
    expect(hole.x1 - hole.x0).toBeCloseTo(CORRIDOR_CAP_WINDOW_WIDTH_M, 2);
    expect((hole.x0 + hole.x1) * 0.5).toBeCloseTo(xMid, 2);
    const yMid = (base.yLo + base.yHi) * 0.5;
    expect((hole.y0 + hole.y1) * 0.5).toBeCloseTo(yMid, 2);
    expect(hole.y1 - hole.y0).toBeGreaterThan(unitHole.y1 - unitHole.y0 + 0.25);
  });
});

describe("corridorCapFacesForExteriorWindows", () => {
  it("includes both exposed short ends", () => {
    expect(corridorCapFacesForExteriorWindows(["e", "n", "s"])).toEqual(["n", "s"]);
    expect(corridorCapFacesForExteriorWindows(["n"])).toEqual(["n"]);
  });
});

describe("unitShellFacesForExteriorWindows", () => {
  const barCtx = (floor: FloorDoc, id: string) => ({
    floor,
    placedObject: floor.objects.find((o) => o.id === id)!,
  });

  it("includes e/w façades and n/s caps only on true bar ends", () => {
    const floor: FloorDoc = {
      id: "isolated_cap",
      version: 1,
      objects: [
        {
          id: "unit_lonely",
          prefabId: "apartment_unit_small_a",
          position: [6.5, 0, 0],
          scale: [8, 3, 8],
        },
      ],
    };
    const exposed: CardinalFace[] = ["e", "n", "s"];
    expect(unitShellFacesForExteriorWindows(exposed, barCtx(floor, "unit_lonely"))).toEqual([
      "e",
      "n",
      "s",
    ]);
    expect(unitShellFacesForExteriorWindows(["w", "s"], barCtx(floor, "unit_lonely"))).toEqual([
      "w",
      "s",
    ]);
    expect(exteriorCornerTangentOnNsFace("unit_e_003")).toBe("max");
    expect(exteriorCornerTangentOnNsFace("unit_w_003")).toBe("min");
  });

  it("south Mamutica end unit gets south cap only — not north toward the adjacent flat", () => {
    const floor = JSON.parse(
      readFileSync(
        new URL("../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
        "utf8",
      ),
    ) as FloorDoc;
    const unit = floor.objects.find((o) => o.id === "unit_e_003")!;
    const exposed = exteriorFacesForPlacedObjectInFloor(floor, unit);
    expect(exposed).toContain("e");
    expect(exposed).toContain("n");
    expect(exposed).toContain("s");
    expect(unitShellFacesForExteriorWindows(exposed, { floor, placedObject: unit })).toEqual([
      "e",
      "s",
    ]);
  });

  it("mid-bar units get no n/s corner caps", () => {
    const floor = JSON.parse(
      readFileSync(
        new URL("../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
        "utf8",
      ),
    ) as FloorDoc;
    const unit = floor.objects.find((o) => o.id === "unit_e_004")!;
    const exposed = exteriorFacesForPlacedObjectInFloor(floor, unit);
    expect(unitShellFacesForExteriorWindows(exposed, { floor, placedObject: unit }).filter(
      (f) => f === "n" || f === "s",
    )).toEqual([]);
  });

  it("includes west-wing bar-end caps on Mamutica typical plates", () => {
    const floor = JSON.parse(
      readFileSync(
        new URL("../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
        "utf8",
      ),
    ) as FloorDoc;
    for (const id of ["unit_w_003", "unit_w_014"] as const) {
      const unit = floor.objects.find((o) => o.id === id)!;
      const exposed = exteriorFacesForPlacedObjectInFloor(floor, unit);
      expect(exposed).toContain("w");
      const caps = unitShellFacesForExteriorWindows(exposed, { floor, placedObject: unit }).filter(
        (f) => f === "n" || f === "s",
      );
      expect(caps.length).toBe(1);
    }
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
  it("cuts centered cap windows on corridor north and south ends", () => {
    const floor = JSON.parse(
      readFileSync(
        new URL("../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
        "utf8",
      ),
    ) as FloorDoc;
    const corridor = floor.objects.find((o) => o.id === "corridor_main")!;
    const exposed = exteriorFacesForPlacedObjectInFloor(floor, corridor);
    expect(corridorCapFacesForExteriorWindows(exposed)).toEqual(["n", "s"]);

    const root = buildFloorMeshes(floor, { storyLevelIndex: 18, facadeSalt: 7 });
    const corridorGroup = root.getObjectByName("corridor_main");
    expect(corridorGroup).toBeTruthy();
    const wallNames: string[] = [];
    const glassNames: string[] = [];
    corridorGroup!.traverse((o) => {
      if (o.name.startsWith("shell_wall_n") || o.name.startsWith("shell_wall_s")) {
        wallNames.push(o.name);
      }
      if (o.name.startsWith("unit_exterior_glass_")) glassNames.push(o.name);
    });
    expect(wallNames.some((n) => n.includes("_x_") || n.includes("_y_"))).toBe(true);
    expect(glassNames.filter((n) => n.includes("_glass_n_"))).toHaveLength(1);
    expect(glassNames.filter((n) => n.includes("_glass_s_"))).toHaveLength(1);
  });

  it("cuts a south bar-end corner window but not north toward the adjacent flat", () => {
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
          id: "unit_e_cap",
          prefabId: "apartment_unit_small_a",
          position: [6.5, 0, -10],
          scale: [8, 3, 8],
        },
        {
          id: "unit_e_inboard",
          prefabId: "apartment_unit_small_a",
          position: [6.5, 0, -2],
          scale: [8, 3, 8],
        },
      ],
    };
    const unitObj = floor.objects[1]!;
    expect(
      unitShellFacesForExteriorWindows(
        exteriorFacesForPlacedObjectInFloor(floor, unitObj),
        { floor, placedObject: unitObj },
      ),
    ).toEqual(["e", "s"]);

    const root = buildFloorMeshes(floor, { storyLevelIndex: 18, facadeSalt: 42 });
    const unitGroup = root.getObjectByName("unit_e_cap");
    expect(unitGroup).toBeTruthy();
    const glassNames: string[] = [];
    unitGroup!.traverse((o) => {
      if (o.name.startsWith("unit_exterior_glass_")) glassNames.push(o.name);
    });
    expect(glassNames.filter((n) => n.includes("_glass_s_"))).toHaveLength(1);
    expect(glassNames.filter((n) => n.includes("_glass_n_"))).toHaveLength(0);
    expect(glassNames.filter((n) => n.includes("_glass_e_")).length).toBeGreaterThan(0);
  });

  const winTestFloor: FloorDoc = {
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
  };

  it("cuts east shell wall into fragments when unit has exterior facade windows", () => {
    const root = buildFloorMeshes(winTestFloor, { storyLevelIndex: 18, facadeSalt: 99 });

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

  it("keeps blown-out abandoned floors holed but omits glass panes (display floor 16)", () => {
    const root = buildFloorMeshes(winTestFloor, { storyLevelIndex: 17, facadeSalt: 99 });

    const names: string[] = [];
    root.traverse((o) => {
      if (o.name.startsWith("shell_wall_e")) names.push(o.name);
    });
    expect(names.some((n) => n.includes("_y_") || n.includes("_z_"))).toBe(true);

    let glass = 0;
    root.traverse((o) => {
      if (o.name.startsWith("unit_exterior_glass_")) glass += 1;
    });
    expect(glass).toBe(0);
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

  it("balcony bay window seals span shell height, include cladding, and omit walk sills", () => {
    const spacing = 60 / 19;
    const building = parseBuildingDoc({
      id: "b",
      version: 1,
      worldOrigin: [0, 0, 0],
      floorRefs: [{ levelIndex: 20, floorDocId: "win_test_floor" }],
    });
    const floor: FloorDoc = {
      id: "win_test_floor",
      version: 1,
      objects: [
        {
          id: "unit_e_003",
          prefabId: "apartment_unit_small_a",
          position: [6.425, 1.605, -76.2],
          scale: [9, 3.05, 7.1],
        },
      ],
    };
    const sx = 9;
    const sy = 3.05;
    const wt = UNIT_SHELL_WALL_THICKNESS_M;
    const vh = Math.max(sy - 2 * wt, 0.05);
    const yLo = -vh * 0.5;
    const yHi = vh * 0.5;
    const px = 6.425;
    const py = 1.605;
    const pz = -76.2;
    const plateY = (20 - 1) * spacing;
    const baseWy = plateY + py;

    const bayFrame = residentialBalconyBayFrame("unit_e_003", sx, 7.1)!;
    const cladOuterWorldX = px + balconyBayFacadeCladOuterLocalX(bayFrame);

    const seals = buildUnitExteriorWindowSealBlockersForBuilding(
      building,
      () => floor,
      spacing,
    );
    const baySeals = seals.filter(
      (b) =>
        b.max[0] >= cladOuterWorldX - 0.05 &&
        b.min[0] <= px + bayFrame.x1 + 0.05 &&
        b.min[2] <= pz + 1 &&
        b.max[2] >= pz - 1,
    );
    expect(baySeals.length).toBeGreaterThan(0);

    const tall = baySeals.filter((b) => b.max[1] - b.min[1] > 2.4);
    expect(tall.length).toBe(baySeals.length);

    for (const s of baySeals) {
      expect(s.min[1]).toBeLessThanOrEqual(baseWy + yLo + 0.11);
      expect(s.max[1]).toBeGreaterThanOrEqual(baseWy + yHi - 0.11);
      expect(s.max[0]).toBeGreaterThanOrEqual(cladOuterWorldX + 0.2);
    }

    const sillsWalk = buildUnitExteriorWindowSillLedgeAABBsForBuilding(
      building,
      () => floor,
      spacing,
      { sillLedgeForWalkSurfaces: true },
    );
    const bayOuterWorldX = px + bayFrame.x1;
    const bayWalkSills = sillsWalk.filter(
      (b) => b.min[0] >= bayOuterWorldX - 0.05 && b.max[0] <= bayOuterWorldX + 2,
    );
    expect(bayWalkSills.length).toBe(0);

    const sillsCollision = buildUnitExteriorWindowSillLedgeAABBsForBuilding(
      building,
      () => floor,
      spacing,
    );
    const bayCollisionSills = sillsCollision.filter(
      (b) => b.min[0] >= bayOuterWorldX - 0.05 && b.max[0] <= bayOuterWorldX + 1,
    );
    expect(bayCollisionSills.length).toBeGreaterThan(0);

    const partitionWorldX = px + sx * 0.5;
    expect(baySeals.every((s) => s.min[0] > partitionWorldX + 0.4)).toBe(true);
    expect(baySeals.some((s) => s.min[0] < px + bayFrame.x1)).toBe(true);
  });
});

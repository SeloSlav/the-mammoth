import { describe, expect, it } from "vitest";
import {
  buildApartmentSwingLeafGeometries,
  buildSolidSwingLeafMergedGeometry,
  SWING_DOOR_PANEL_THICK_M,
} from "./swingDoorMesh.js";

describe("buildSolidSwingLeafMergedGeometry", () => {
  it("produces a single merged geometry covering the full leaf rectangle", () => {
    const geom = buildSolidSwingLeafMergedGeometry({ panelW: 1.26, panelH: 2.06 });
    try {
      const pos = geom.getAttribute("position");
      expect(pos.count).toBeGreaterThan(0);
      geom.computeBoundingBox();
      const bb = geom.boundingBox!;
      // Hinge sits at swing-local origin; outer leaf matches authored panelW × panelH so the
      // door fills the wall opening (rails/stiles sit on that outer rectangle).
      const usableW = 1.26;
      const usableH = 2.06;
      expect(bb.min.z).toBeLessThan(0);
      expect(bb.max.z).toBeCloseTo(0, 5);
      expect(bb.min.z).toBeCloseTo(-usableW, 5);
      expect(bb.max.y - bb.min.y).toBeCloseTo(usableH, 5);
      expect(bb.max.x - bb.min.x).toBeCloseTo(SWING_DOOR_PANEL_THICK_M, 5);
    } finally {
      geom.dispose();
    }
  });

  it("is stable across invocations (pure function)", () => {
    const a = buildSolidSwingLeafMergedGeometry({ panelW: 1.26, panelH: 2.06 });
    const b = buildSolidSwingLeafMergedGeometry({ panelW: 1.26, panelH: 2.06 });
    try {
      const pa = a.getAttribute("position");
      const pb = b.getAttribute("position");
      expect(pa.count).toBe(pb.count);
      for (let i = 0; i < pa.count * 3; i++) {
        expect((pa.array as Float32Array)[i]).toBeCloseTo(
          (pb.array as Float32Array)[i]!,
          5,
        );
      }
    } finally {
      a.dispose();
      b.dispose();
    }
  });
});

describe("buildApartmentSwingLeafGeometries", () => {
  it("returns frame-only merged geometry when solid", () => {
    const r = buildApartmentSwingLeafGeometries(
      { panelW: 1.26, panelH: 2.06 },
      { solid: true } as never,
    );
    try {
      expect(r.glass).toBeUndefined();
      expect(r.frame.getAttribute("position").count).toBeGreaterThan(0);
    } finally {
      r.frame.dispose();
    }
  });

  it("splits frame + glass when not solid", () => {
    const r = buildApartmentSwingLeafGeometries(
      { panelW: 1.26, panelH: 2.06 },
      {
        solid: false,
        glassOpening: { widthM: 0.5, heightM: 1.0, centerYM: 0 },
      } as never,
    );
    try {
      expect(r.glass).toBeDefined();
      expect(r.frame.getAttribute("position").count).toBeGreaterThan(0);
      expect(r.glass!.getAttribute("position").count).toBeGreaterThan(0);
    } finally {
      r.frame.dispose();
      r.glass?.dispose();
    }
  });
});

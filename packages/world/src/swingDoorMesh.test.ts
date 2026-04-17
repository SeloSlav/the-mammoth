import { describe, expect, it } from "vitest";
import {
  buildSolidSwingLeafMergedGeometry,
  SWING_DOOR_FRAME_Y_INSET_M,
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
      // Hinge sits at swing-local origin; leaf extends in -Z across (panelW - 0.1) and vertically
      // across panelH - SWING_DOOR_FRAME_Y_INSET_M. Side tolerances come from stile/rail widths.
      const usableW = 1.26 - 0.1;
      const usableH = 2.06 - SWING_DOOR_FRAME_Y_INSET_M;
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

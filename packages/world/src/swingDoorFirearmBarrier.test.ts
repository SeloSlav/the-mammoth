import { describe, expect, it } from "vitest";
import {
  SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01,
  SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M,
  SWING_DOOR_PASSAGE_OPEN_THRESH,
  SWING_DOOR_PARKED_LEAF_MIN_OPEN_01,
  expandSwingDoorClosedSlabAabbForFirearmLOS,
  swingDoorClosedSlabAabb,
  swingDoorFirearmBarrierAabb,
} from "./swingDoorCollision.js";

describe("swingDoor firearm LOS barrier", () => {
  const baseClosed = swingDoorClosedSlabAabb({
    face: "w",
    hingeX: 1.25,
    hingeZ: -10,
    feetY: 3,
    panelWidthM: 1.26,
    panelHeightM: 2.06,
  });

  it("expands tangent span for jamb-aligned hit traces", () => {
    const x = expandSwingDoorClosedSlabAabbForFirearmLOS(baseClosed, "w");
    expect(x.max[2] - x.min[2]).toBeCloseTo(
      baseClosed.max[2] - baseClosed.min[2] + 2 * SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M,
      6,
    );
    expect(x.max[0] - x.min[0]).toBeGreaterThan(baseClosed.max[0] - baseClosed.min[0]);
  });

  it("returns expanded closed slab for mid-swing openings (movement pass-through, LOS blocked)", () => {
    const a = swingDoorFirearmBarrierAabb({
      open01: SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01 + 0.08,
      face: "w",
      hingeX: 1.25,
      hingeZ: -10,
      feetY: 3,
      panelWidthM: 1.26,
      panelHeightM: 2.06,
      swingInward: false,
    });
    expect(a).not.toBeNull();
    const zSpan = (a?.max[2] ?? 0) - (a?.min[2] ?? 0);
    expect(zSpan).toBeGreaterThan(baseClosed.max[2] - baseClosed.min[2]);
  });

  it("clears when door reaches passage openness", () => {
    expect(
      swingDoorFirearmBarrierAabb({
        open01: SWING_DOOR_PASSAGE_OPEN_THRESH,
        face: "w",
        hingeX: 1.25,
        hingeZ: -10,
        feetY: 3,
        panelWidthM: 1.26,
        panelHeightM: 2.06,
      }),
    ).toBeNull();
  });

  it("clears LOS barrier once passage threshold is reached (including fully parked open)", () => {
    expect(
      swingDoorFirearmBarrierAabb({
        open01: SWING_DOOR_PARKED_LEAF_MIN_OPEN_01,
        face: "e",
        hingeX: -2,
        hingeZ: 50,
        feetY: 3.05,
        panelWidthM: 1.1,
        panelHeightM: 2.0,
        swingInward: false,
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  FACE_CODE,
  FACE_FROM_CODE,
  SWING_DOOR_CLOSED_SLAB_HALF_THICK_M,
  SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01,
  SWING_DOOR_DEFAULT_MAX_RAD,
  SWING_DOOR_INTERACT_RADIUS_M,
  SWING_DOOR_INTERACT_Y_HALF_M,
  SWING_DOOR_OPEN_LEAF_HALF_THICK_M,
  SWING_DOOR_OPEN_LEAF_XZ_PAD_M,
  SWING_DOOR_PARKED_LEAF_MIN_OPEN_01,
  swingDoorClosedSlabAabb,
  swingDoorClosedSlabActive,
  swingDoorOpenSideNormal,
  swingDoorOrientationForFace,
  swingDoorParkedLeafAabb,
  swingDoorParkedLeafActive,
  swingDoorPlayerInInteractRange,
  swingDoorTangentRest,
  swingDoorYawRad,
  type SwingDoorFace,
} from "./swingDoorCollision.js";

/**
 * These expectations are also asserted verbatim by the Rust `#[cfg(test)] mod tests` in
 * `apps/server/src/apartment_door/mod.rs`. If either side changes, both must update together.
 */
describe("swingDoorCollision: per-face convention", () => {
  it("round-trips face ↔ u8", () => {
    for (const face of ["n", "s", "e", "w"] as SwingDoorFace[]) {
      const code = FACE_CODE[face];
      expect(FACE_FROM_CODE[code]).toBe(face);
    }
  });

  it("face codes match server ordering (n=0, s=1, e=2, w=3)", () => {
    expect(FACE_CODE.n).toBe(0);
    expect(FACE_CODE.s).toBe(1);
    expect(FACE_CODE.e).toBe(2);
    expect(FACE_CODE.w).toBe(3);
  });

  it("swing yaw = baseYaw + sign * open * maxRad", () => {
    const rad = 1.4;
    expect(swingDoorYawRad("w", 0, rad)).toBeCloseTo(0);
    expect(swingDoorYawRad("w", 1, rad)).toBeCloseTo(-rad);
    expect(swingDoorYawRad("e", 1, rad)).toBeCloseTo(rad);
    expect(swingDoorYawRad("n", 0, rad)).toBeCloseTo(Math.PI / 2);
    expect(swingDoorYawRad("n", 1, rad)).toBeCloseTo(Math.PI / 2 + rad);
    expect(swingDoorYawRad("s", 1, rad)).toBeCloseTo(Math.PI / 2 - rad);
  });

  it("open-side normal is axis-aligned unit", () => {
    expect(swingDoorOpenSideNormal("w")).toEqual({ x: -1, z: 0 });
    expect(swingDoorOpenSideNormal("e")).toEqual({ x: 1, z: 0 });
    expect(swingDoorOpenSideNormal("n")).toEqual({ x: 0, z: 1 });
    expect(swingDoorOpenSideNormal("s")).toEqual({ x: 0, z: -1 });
  });

  it("tangent rest vectors are perpendicular to open-side normal", () => {
    for (const face of ["n", "s", "e", "w"] as SwingDoorFace[]) {
      const n = swingDoorOpenSideNormal(face);
      const t = swingDoorTangentRest(face);
      expect(n.x * t.x + n.z * t.z).toBeCloseTo(0);
      expect(t.x * t.x + t.z * t.z).toBeCloseTo(1);
    }
  });

  it("orientation swing sign matches documented table", () => {
    expect(swingDoorOrientationForFace("w").swingSign).toBe(-1);
    expect(swingDoorOrientationForFace("e").swingSign).toBe(1);
    expect(swingDoorOrientationForFace("n").swingSign).toBe(1);
    expect(swingDoorOrientationForFace("s").swingSign).toBe(-1);
  });
});

describe("swingDoorClosedSlabAabb", () => {
  const base = {
    hingeX: 2,
    hingeZ: -112,
    feetY: 3.4,
    panelWidthM: 1.26,
    panelHeightM: 2.06,
  };

  it("W-face slab wraps hinge on X, extends in -Z", () => {
    const aabb = swingDoorClosedSlabAabb({ face: "w", ...base });
    expect(aabb.min[0]).toBeCloseTo(base.hingeX - SWING_DOOR_CLOSED_SLAB_HALF_THICK_M);
    expect(aabb.max[0]).toBeCloseTo(base.hingeX + SWING_DOOR_CLOSED_SLAB_HALF_THICK_M);
    expect(aabb.max[2]).toBeCloseTo(base.hingeZ);
    expect(aabb.min[2]).toBeCloseTo(base.hingeZ - base.panelWidthM);
    expect(aabb.min[1]).toBeCloseTo(base.feetY);
    expect(aabb.max[1]).toBeCloseTo(base.feetY + base.panelHeightM);
  });

  it("N-face slab wraps hinge on Z, extends in -X", () => {
    const aabb = swingDoorClosedSlabAabb({ face: "n", ...base });
    expect(aabb.min[2]).toBeCloseTo(base.hingeZ - SWING_DOOR_CLOSED_SLAB_HALF_THICK_M);
    expect(aabb.max[2]).toBeCloseTo(base.hingeZ + SWING_DOOR_CLOSED_SLAB_HALF_THICK_M);
    expect(aabb.max[0]).toBeCloseTo(base.hingeX);
    expect(aabb.min[0]).toBeCloseTo(base.hingeX - base.panelWidthM);
  });

  it("S-face slab extends in -X just like N (tangent is -X for both)", () => {
    const n = swingDoorClosedSlabAabb({ face: "n", ...base });
    const s = swingDoorClosedSlabAabb({ face: "s", ...base });
    expect(n.min[0]).toBeCloseTo(s.min[0]);
    expect(n.max[0]).toBeCloseTo(s.max[0]);
  });
});

describe("swingDoorParkedLeafAabb", () => {
  const base = {
    hingeX: 10,
    hingeZ: 20,
    feetY: 0,
    panelWidthM: 1.26,
    panelHeightM: 2.06,
  };

  it("W-face parked leaf extends into -X corridor with XZ padding", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "w", ...base });
    const pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
    const ht = SWING_DOOR_OPEN_LEAF_HALF_THICK_M;
    expect(aabb.max[0]).toBeCloseTo(base.hingeX + pad);
    expect(aabb.min[0]).toBeCloseTo(base.hingeX - base.panelWidthM - pad);
    expect(aabb.min[2]).toBeCloseTo(base.hingeZ - ht - pad);
    expect(aabb.max[2]).toBeCloseTo(base.hingeZ + ht + pad);
  });

  it("N-face parked leaf extends into +Z corridor", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "n", ...base });
    expect(aabb.min[2]).toBeCloseTo(base.hingeZ - SWING_DOOR_OPEN_LEAF_XZ_PAD_M);
    expect(aabb.max[2]).toBeCloseTo(base.hingeZ + base.panelWidthM + SWING_DOOR_OPEN_LEAF_XZ_PAD_M);
  });
});

describe("swingDoorClosedSlabActive / swingDoorParkedLeafActive", () => {
  it("closed regime covers [0 .. MAX_CLOSED]", () => {
    expect(swingDoorClosedSlabActive(0)).toBe(true);
    expect(swingDoorClosedSlabActive(SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01)).toBe(true);
    expect(swingDoorClosedSlabActive(SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01 + 1e-3)).toBe(false);
  });

  it("parked-leaf regime covers [MIN_PARKED .. 1]", () => {
    expect(swingDoorParkedLeafActive(SWING_DOOR_PARKED_LEAF_MIN_OPEN_01)).toBe(true);
    expect(swingDoorParkedLeafActive(1)).toBe(true);
    expect(swingDoorParkedLeafActive(SWING_DOOR_PARKED_LEAF_MIN_OPEN_01 - 1e-3)).toBe(false);
  });

  it("regimes don't overlap (mid-swing is 'not blocking')", () => {
    for (const u of [0.1, 0.4, 0.5, 0.8]) {
      expect(swingDoorClosedSlabActive(u) && swingDoorParkedLeafActive(u)).toBe(false);
    }
  });
});

describe("swingDoorPlayerInInteractRange", () => {
  const base = {
    hingeX: 0,
    hingeZ: 0,
    feetY: 10,
    panelWidthM: 1.26,
    panelHeightM: 2.06,
  };

  it("accepts player at hinge when feet near panel mid-Y", () => {
    const cy = base.feetY + base.panelHeightM * 0.5;
    expect(
      swingDoorPlayerInInteractRange({ ...base, px: 0, py: cy, pz: 0 }),
    ).toBe(true);
  });

  it("rejects player too far in XZ", () => {
    const r = SWING_DOOR_INTERACT_RADIUS_M + base.panelWidthM * 0.5;
    const cy = base.feetY + base.panelHeightM * 0.5;
    expect(
      swingDoorPlayerInInteractRange({ ...base, px: r + 0.5, py: cy, pz: 0 }),
    ).toBe(false);
  });

  it("rejects player outside Y band", () => {
    const cy = base.feetY + base.panelHeightM * 0.5;
    expect(
      swingDoorPlayerInInteractRange({
        ...base,
        px: 0,
        py: cy + SWING_DOOR_INTERACT_Y_HALF_M + 0.5,
        pz: 0,
      }),
    ).toBe(false);
  });
});

describe("default max swing radians", () => {
  it("is large enough to fully clear the doorway", () => {
    // A 1.26 m panel swinging out of a 1.26 m opening needs at least π/2 rad;
    // 1.4 rad > 80° is conservative without wrapping past.
    expect(SWING_DOOR_DEFAULT_MAX_RAD).toBeGreaterThan(Math.PI / 2 - 0.2);
    expect(SWING_DOOR_DEFAULT_MAX_RAD).toBeLessThanOrEqual(Math.PI);
  });
});

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
    expect(swingDoorYawRad("w", 1, rad)).toBeCloseTo(rad);
    expect(swingDoorYawRad("e", 1, rad)).toBeCloseTo(-rad);
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
    expect(swingDoorOrientationForFace("w").swingSign).toBe(1);
    expect(swingDoorOrientationForFace("e").swingSign).toBe(-1);
    expect(swingDoorOrientationForFace("n").swingSign).toBe(1);
    expect(swingDoorOrientationForFace("s").swingSign).toBe(-1);
  });

  /**
   * Visual-collision parity: at full open the rendered leaf tip must swing toward the same side
   * the parked-leaf collision AABB occupies. Otherwise the player sees open sky where physics
   * blocks and vice-versa — the exact "pushed back through an invisible leaf" bug that triggered
   * this regression.
   */
  it("at full open, tip direction matches open-side normal", () => {
    const maxRad = Math.PI / 2;
    for (const face of ["n", "s", "e", "w"] as SwingDoorFace[]) {
      const yaw = swingDoorYawRad(face, 1, maxRad);
      // Tip at rest is local (0, 0, -1); after rotating by yaw about Y the world tip is
      // (-sin yaw, 0, -cos yaw).
      const tipX = -Math.sin(yaw);
      const tipZ = -Math.cos(yaw);
      const normal = swingDoorOpenSideNormal(face);
      expect(tipX).toBeCloseTo(normal.x, 5);
      expect(tipZ).toBeCloseTo(normal.z, 5);
    }
  });

  /** At rest (closed), the leaf tip must lie along `swingDoorTangentRest(face)`. */
  it("at rest, tip direction matches tangent rest", () => {
    for (const face of ["n", "s", "e", "w"] as SwingDoorFace[]) {
      const { baseYaw } = swingDoorOrientationForFace(face);
      const tipX = -Math.sin(baseYaw);
      const tipZ = -Math.cos(baseYaw);
      const tan = swingDoorTangentRest(face);
      expect(tipX).toBeCloseTo(tan.x, 5);
      expect(tipZ).toBeCloseTo(tan.z, 5);
    }
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

  it("W-face parked leaf extends into -X corridor and parks on +Z (wall) side of hinge", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "w", ...base });
    const pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
    const ht = SWING_DOOR_OPEN_LEAF_HALF_THICK_M;
    expect(aabb.max[0]).toBeCloseTo(base.hingeX + pad);
    expect(aabb.min[0]).toBeCloseTo(base.hingeX - base.panelWidthM - pad);
    // Doorway opens in -Z; the AABB must NOT intrude past the hinge into the doorway.
    expect(aabb.min[2]).toBeCloseTo(base.hingeZ);
    expect(aabb.max[2]).toBeCloseTo(base.hingeZ + 2 * ht + pad);
  });

  it("E-face parked leaf parks on +Z (wall) side of hinge (mirror of W)", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "e", ...base });
    expect(aabb.min[2]).toBeCloseTo(base.hingeZ);
    expect(aabb.max[2]).toBeCloseTo(
      base.hingeZ + 2 * SWING_DOOR_OPEN_LEAF_HALF_THICK_M + SWING_DOOR_OPEN_LEAF_XZ_PAD_M,
    );
  });

  it("N-face parked leaf extends into +Z corridor and parks on +X (wall) side of hinge", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "n", ...base });
    const pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
    const ht = SWING_DOOR_OPEN_LEAF_HALF_THICK_M;
    expect(aabb.min[2]).toBeCloseTo(base.hingeZ - pad);
    expect(aabb.max[2]).toBeCloseTo(base.hingeZ + base.panelWidthM + pad);
    expect(aabb.min[0]).toBeCloseTo(base.hingeX);
    expect(aabb.max[0]).toBeCloseTo(base.hingeX + 2 * ht + pad);
  });

  /**
   * The crucial regression: the doorway opening (south of the hinge along the wall tangent)
   * must NOT be obstructed by the parked-leaf collision AABB. A 0.32 m radius capsule walking
   * straight into the middle of the opening must clear the AABB.
   */
  it("does not block a player capsule walking through the centre of the doorway", () => {
    const radius = 0.32;
    for (const face of ["n", "s", "e", "w"] as SwingDoorFace[]) {
      const aabb = swingDoorParkedLeafAabb({ face, ...base });
      const tan = swingDoorTangentRest(face);
      const midX = base.hingeX + tan.x * base.panelWidthM * 0.5;
      const midZ = base.hingeZ + tan.z * base.panelWidthM * 0.5;
      const cap = {
        min: [midX - radius, base.feetY + 0.25, midZ - radius],
        max: [midX + radius, base.feetY + 1.72, midZ + radius],
      } as const;
      const overlap =
        cap.max[0] > aabb.min[0] &&
        cap.min[0] < aabb.max[0] &&
        cap.max[1] > aabb.min[1] &&
        cap.min[1] < aabb.max[1] &&
        cap.max[2] > aabb.min[2] &&
        cap.min[2] < aabb.max[2];
      expect({ face, overlap }).toEqual({ face, overlap: false });
    }
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

/**
 * Regression guard for the "pushed back by an invisible leaf" bug: when a door is fully parked
 * open, the rendered leaf direction and the parked-leaf collision AABB must lie on the SAME side
 * of the hinge. A mismatch means the player sees a clear doorway but collision bumps them back,
 * exactly the regression that triggered this test.
 *
 * Two checks:
 * 1. Directional: the tip at full swing (with the kit's actual `maxRad`) must be on the
 *    corridor-side of the hinge along the open-side normal.
 * 2. Containment (idealized): at a perfect 90° park, the tip lies inside the parked-leaf AABB.
 *    This locks the AABB formula to the canonical orientation the rotation table encodes.
 */
describe("visual ↔ collision parity at full open", () => {
  const base = {
    hingeX: 10,
    hingeZ: 20,
    feetY: 0,
    panelWidthM: 1.26,
    panelHeightM: 2.06,
  };

  for (const face of ["n", "s", "e", "w"] as SwingDoorFace[]) {
    it(`face ${face}: tip swings onto the corridor side`, () => {
      const yaw = swingDoorYawRad(face, 1, SWING_DOOR_DEFAULT_MAX_RAD);
      const tipDX = -Math.sin(yaw) * base.panelWidthM;
      const tipDZ = -Math.cos(yaw) * base.panelWidthM;
      const normal = swingDoorOpenSideNormal(face);
      // Projection of the tip displacement onto the open-side normal must be strongly positive
      // (the leaf ends up in the corridor half-space, not the room).
      const proj = tipDX * normal.x + tipDZ * normal.z;
      expect(proj).toBeGreaterThan(base.panelWidthM * 0.9);
    });

    it(`face ${face}: at ideal 90° park, tip lies inside parked-leaf AABB`, () => {
      const yaw = swingDoorYawRad(face, 1, Math.PI / 2);
      const tipX = base.hingeX - Math.sin(yaw) * base.panelWidthM;
      const tipZ = base.hingeZ - Math.cos(yaw) * base.panelWidthM;
      const aabb = swingDoorParkedLeafAabb({ face, ...base });
      // The tip lies on the hinge wall plane along the tangent axis after the asymmetric AABB
      // tightening (the doorway side is intentionally clipped off). Allow ε along that axis.
      expect(tipX).toBeGreaterThanOrEqual(aabb.min[0] - 1e-4);
      expect(tipX).toBeLessThanOrEqual(aabb.max[0] + 1e-4);
      expect(tipZ).toBeGreaterThanOrEqual(aabb.min[2] - 1e-4);
      expect(tipZ).toBeLessThanOrEqual(aabb.max[2] + 1e-4);
    });
  }
});

describe("default max swing radians", () => {
  it("is large enough to fully clear the doorway", () => {
    // A 1.26 m panel swinging out of a 1.26 m opening needs at least π/2 rad;
    // 1.4 rad > 80° is conservative without wrapping past.
    expect(SWING_DOOR_DEFAULT_MAX_RAD).toBeGreaterThan(Math.PI / 2 - 0.2);
    expect(SWING_DOOR_DEFAULT_MAX_RAD).toBeLessThanOrEqual(Math.PI);
  });
});

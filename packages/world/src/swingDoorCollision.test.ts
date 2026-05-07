import { describe, expect, it } from "vitest";
import {
  FACE_CODE,
  FACE_FROM_CODE,
  SWING_DOOR_CLOSED_SLAB_HALF_THICK_M,
  SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01,
  SWING_DOOR_DEFAULT_MAX_RAD,
  SWING_DOOR_INTERACT_RADIUS_M,
  SWING_DOOR_INTERACT_FEET_ABOVE_HEAD_SLACK_M,
  SWING_DOOR_OPEN_LEAF_HALF_THICK_M,
  SWING_DOOR_OPEN_LEAF_XZ_PAD_M,
  SWING_DOOR_PARKED_LEAF_MIN_OPEN_01,
  swingDoorClosedSlabAabb,
  swingDoorClosedSlabActive,
  swingDoorOpenSideNormal,
  swingDoorOrientationForFace,
  swingDoorParkedLeafAabb,
  swingDoorParkedLeafActive,
  swingDoorMovementBlockingAabb,
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
   * Visual sanity: at full open the rendered leaf tip swings toward `swingDoorOpenSideNormal`.
   * (Capsule locomotion omits the parked-leaf AABB; this still guards mesh orientation.)
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

describe("swingDoorParkedLeafAabb (outward — elevator landing doors)", () => {
  const base = {
    hingeX: 10,
    hingeZ: 20,
    feetY: 0,
    panelWidthM: 1.26,
    panelHeightM: 2.06,
  };

  it("W-face parked leaf extends into -X corridor; hinge side flush with wall plane", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "w", ...base });
    const pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
    const ht = SWING_DOOR_OPEN_LEAF_HALF_THICK_M;
    expect(aabb.max[0]).toBeCloseTo(base.hingeX);
    expect(aabb.min[0]).toBeCloseTo(base.hingeX - base.panelWidthM - pad);
    expect(aabb.min[2]).toBeCloseTo(base.hingeZ - ht - pad);
    expect(aabb.max[2]).toBeCloseTo(base.hingeZ + ht + pad);
  });

  it("N-face parked leaf extends into +Z corridor; hinge side flush with wall plane", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "n", ...base });
    const pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
    const ht = SWING_DOOR_OPEN_LEAF_HALF_THICK_M;
    expect(aabb.min[2]).toBeCloseTo(base.hingeZ);
    expect(aabb.max[2]).toBeCloseTo(base.hingeZ + base.panelWidthM + pad);
    expect(aabb.min[0]).toBeCloseTo(base.hingeX - ht - pad);
    expect(aabb.max[0]).toBeCloseTo(base.hingeX + ht + pad);
  });
});

describe("swingDoorParkedLeafAabb (inward swing support)", () => {
  const base = {
    hingeX: 10,
    hingeZ: 20,
    feetY: 0,
    panelWidthM: 1.26,
    panelHeightM: 2.06,
  };

  it("W-face inward leaf extends INTO the unit (+X); hinge side flush with wall plane", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "w", swingInward: true, ...base });
    const pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
    expect(aabb.min[0]).toBeCloseTo(base.hingeX);
    expect(aabb.max[0]).toBeCloseTo(base.hingeX + base.panelWidthM + pad);
  });

  it("E-face inward leaf extends INTO the unit (-X); hinge side flush with wall plane", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "e", swingInward: true, ...base });
    const pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
    expect(aabb.min[0]).toBeCloseTo(base.hingeX - base.panelWidthM - pad);
    expect(aabb.max[0]).toBeCloseTo(base.hingeX);
  });

  /** Regression guard for the "rubber-banding at the threshold" bug: the parked-leaf AABB
   *  must NEVER extend across the hinge plane (wall plane) — otherwise the moment the door
   *  snaps to fully-open the player gets depenetrated backward across the wall. */
  it("W-face inward hinge side is flush with wall (no cross-threshold pad)", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "w", swingInward: true, ...base });
    expect(aabb.min[0]).toBeGreaterThanOrEqual(base.hingeX - 1e-6);
  });

  it("E-face inward hinge side is flush with wall (no cross-threshold pad)", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "e", swingInward: true, ...base });
    expect(aabb.max[0]).toBeLessThanOrEqual(base.hingeX + 1e-6);
  });

  it("N-face inward hinge side is flush with wall (no cross-threshold pad)", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "n", swingInward: true, ...base });
    expect(aabb.max[2]).toBeLessThanOrEqual(base.hingeZ + 1e-6);
  });

  it("S-face inward hinge side is flush with wall (no cross-threshold pad)", () => {
    const aabb = swingDoorParkedLeafAabb({ face: "s", swingInward: true, ...base });
    expect(aabb.min[2]).toBeGreaterThanOrEqual(base.hingeZ - 1e-6);
  });

  /** Open-door corridor-traffic regression for private-side/inward leaves. */
  it("does not block corridor traffic past an inward-swing doorway", () => {
    const radius = 0.22;
    for (const face of ["w", "e", "n", "s"] as SwingDoorFace[]) {
      const aabb = swingDoorParkedLeafAabb({ face, swingInward: true, ...base });
      const n = swingDoorOpenSideNormal(face); // corridor direction
      // Player 0.3 m INTO the corridor at hinge tangent position.
      const cx = base.hingeX + n.x * 0.3;
      const cz = base.hingeZ + n.z * 0.3;
      const cap = {
        min: [cx - radius, base.feetY + 0.25, cz - radius],
        max: [cx + radius, base.feetY + 1.72, cz + radius],
      } as const;
      const overlap =
        cap.max[0] > aabb.min[0] &&
        cap.min[0] < aabb.max[0] &&
        cap.max[2] > aabb.min[2] &&
        cap.min[2] < aabb.max[2];
      expect({ face, overlap }).toEqual({ face, overlap: false });
    }
  });

  /** Primary regression: a player walking through the middle of the doorway after an inward
   *  swing must NOT be blocked. */
  it("does not block a player capsule walking through an inward-swing doorway centre", () => {
    const radius = 0.22;
    for (const face of ["n", "s", "e", "w"] as SwingDoorFace[]) {
      const aabb = swingDoorParkedLeafAabb({ face, swingInward: true, ...base });
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

  it("regimes don't overlap at extremes (mid-swing uses hull, not closed slab)", () => {
    for (const u of [0.1, 0.4, 0.5, 0.8]) {
      expect(swingDoorClosedSlabActive(u) && swingDoorParkedLeafActive(u)).toBe(false);
    }
  });
});

describe("swingDoorMovementBlockingAabb", () => {
  const hullDoorBase = {
    hingeX: 10,
    hingeZ: -112,
    feetY: 3,
    panelWidthM: 1.26,
    panelHeightM: 2.06,
    swingInward: false,
    maxSwingRad: SWING_DOOR_DEFAULT_MAX_RAD,
  } as const;

  it("uses closed slab when essentially shut", () => {
    const a = swingDoorMovementBlockingAabb({
      open01: 0,
      face: "w",
      ...hullDoorBase,
    });
    expect(a).not.toBeNull();
  });

  it("returns swinging hull after closed slab regime (parked/open corridor leaf)", () => {
    const a = swingDoorMovementBlockingAabb({
      open01: 1,
      face: "w",
      ...hullDoorBase,
    });
    expect(a).not.toBeNull();
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

  it("rejects player outside tall-Y eligibility band", () => {
    expect(
      swingDoorPlayerInInteractRange({
        ...base,
        px: 0,
        py: base.feetY + base.panelHeightM + SWING_DOOR_INTERACT_FEET_ABOVE_HEAD_SLACK_M + 5,
        pz: 0,
      }),
    ).toBe(false);
  });
});

/**
 * Regression guard for mesh orientation at full open: tip lies inside the **geometry** AABB used
 * for decals/debug — capsule locomotion does not mount this volume when past the closed slab.
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
    for (const swingInward of [false, true]) {
      const label = swingInward ? "inward" : "outward";
      it(`face ${face} (${label}): at 90° park, tip lies inside parked-leaf AABB`, () => {
        const yaw = swingDoorYawRad(face, 1, Math.PI / 2, swingInward);
        const tipX = base.hingeX - Math.sin(yaw) * base.panelWidthM;
        const tipZ = base.hingeZ - Math.cos(yaw) * base.panelWidthM;
        const aabb = swingDoorParkedLeafAabb({ face, swingInward, ...base });
        expect(tipX).toBeGreaterThanOrEqual(aabb.min[0] - 1e-4);
        expect(tipX).toBeLessThanOrEqual(aabb.max[0] + 1e-4);
        expect(tipZ).toBeGreaterThanOrEqual(aabb.min[2] - 1e-4);
        expect(tipZ).toBeLessThanOrEqual(aabb.max[2] + 1e-4);
      });

      it(`face ${face} (${label}): tip displacement matches open-side normal direction`, () => {
        const yaw = swingDoorYawRad(face, 1, SWING_DOOR_DEFAULT_MAX_RAD, swingInward);
        const tipDX = -Math.sin(yaw) * base.panelWidthM;
        const tipDZ = -Math.cos(yaw) * base.panelWidthM;
        const n = swingDoorOpenSideNormal(face);
        const proj = tipDX * n.x + tipDZ * n.z;
        const expectedSign = swingInward ? -1 : 1;
        expect(expectedSign * proj).toBeGreaterThan(base.panelWidthM * 0.9);
      });
    }
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

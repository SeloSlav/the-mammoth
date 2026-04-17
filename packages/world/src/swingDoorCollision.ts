/**
 * Per-face convention table + collision/interaction primitives shared by every swing door.
 *
 * Every consumer (the client renderer, the server collision pass, the client prediction clamp,
 * and the interaction proximity checks) reads these formulas. Editing this file updates both the
 * elevator-landing "corridor door" and apartment-unit doors — that's the DRY contract.
 *
 * ## Coordinate convention
 *
 * - The leaf hangs from the hinge at `(hingeX, feetY, hingeZ)` and rotates about world Y.
 * - At rest (closed), the leaf lies flat against the wall, extending **away from the hinge along
 *   the wall in the local -Z direction** of the swing group.
 * - Two swing directions are supported (selected per door):
 *   - **outward** (default, used by elevator landing doors): leaf swings into the public /
 *     corridor side — i.e. along `swingDoorOpenSideNormal(face)`.
 *   - **inward** (used by apartment-unit doors): leaf swings into the private / unit side — i.e.
 *     along `-swingDoorOpenSideNormal(face)`. This matches real-world apartment-door behavior
 *     (inward-swinging residential doors) and keeps the open leaf out of the shared corridor.
 *   The leaf direction is chosen per door via the `swingInward` flag passed to the primitives.
 *
 * ## Per-face rotation (outward convention)
 *
 * Derivation: the tip at rest is `R_y(baseYaw(face)) · (0, 0, -1)`, which equals
 * `swingDoorTangentRest(face)`. After opening outward, the tip is
 * `R_y(baseYaw + swingSign*open*maxRad) · (0, 0, -1)`. Setting that ≈
 * `swingDoorOpenSideNormal(face)` at `open = 1, maxRad ≈ π/2` fixes each row below:
 *
 * | face | base yaw (rad) | swing sign (outward) | tip at rest | tip at full open (outward) |
 * |------|---------------:|---------------------:|------------:|---------------------------:|
 * | "w"  |              0 |                   +1 |     (0, -1) |                    (-1, 0) |
 * | "e"  |              0 |                   -1 |     (0, -1) |                    (+1, 0) |
 * | "n"  |            π/2 |                   +1 |     (-1, 0) |                    (0, +1) |
 * | "s"  |            π/2 |                   -1 |     (-1, 0) |                    (0, -1) |
 *
 * Inward simply negates `swingSign`, so the yaw rotates the opposite direction and the tip ends
 * up at the opposite normal: `tip_inward = -swingDoorOpenSideNormal(face)`.
 *
 * Final swing yaw = `baseYaw(face) + effectiveSwingSign * open01 * maxRad`, where
 * `effectiveSwingSign = swingInward ? -swingSign(face) : swingSign(face)`.
 */
import type { CollisionAabb } from "./collisionScene.js";

export type SwingDoorFace = "n" | "s" | "e" | "w";

/** Closed-slab plate thickness (along wall normal). Symmetric on both sides of the wall. */
export const SWING_DOOR_CLOSED_SLAB_HALF_THICK_M = 0.09;

/** Open-leaf bounding box thickness. */
export const SWING_DOOR_OPEN_LEAF_HALF_THICK_M = 0.07;

/** Open-leaf XZ pad (collision AABB grows by this much on every axis to soak prediction jitter). */
export const SWING_DOOR_OPEN_LEAF_XZ_PAD_M = 0.04;

/** Apartment-door anim speed (per-second open01 rate). Mirrors elevator landing's `EXTERIOR_DOOR_ANIM_SPEED`. */
export const SWING_DOOR_ANIM_SPEED = 3.0;

/** Open01 below this counts as "essentially closed" for collision purposes. */
export const SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01 = 0.025;

/** Open01 at/above this counts as "fully parked open" for the leaf collider. */
export const SWING_DOOR_PARKED_LEAF_MIN_OPEN_01 = 0.97;

/** When `open01 >= this` the door no longer obstructs passage. */
export const SWING_DOOR_PASSAGE_OPEN_THRESH = 0.85;

/** Default max swing in radians when the kit doesn't override.
 *  ~89° (1.55 rad) parks the leaf nearly perpendicular to the wall so the parked-leaf AABB
 *  matches the rendered geometry (the leaf clears the doorway opening, sitting flat against
 *  the corridor side of the wall). Matches `content/elevator/landing_kit.json`. */
export const SWING_DOOR_DEFAULT_MAX_RAD = 1.55;

/** Interaction radius (world meters) — player must be within this XZ distance of the hinge. */
export const SWING_DOOR_INTERACT_RADIUS_M = 1.6;
/** Interaction Y half-window (world meters) — player feet within this band relative to door feet. */
export const SWING_DOOR_INTERACT_Y_HALF_M = 1.4;

export type SwingDoorOrientation = {
  baseYaw: number;
  swingSign: 1 | -1;
};

const ORIENTATIONS: Record<SwingDoorFace, SwingDoorOrientation> = {
  w: { baseYaw: 0, swingSign: 1 },
  e: { baseYaw: 0, swingSign: -1 },
  n: { baseYaw: Math.PI / 2, swingSign: 1 },
  s: { baseYaw: Math.PI / 2, swingSign: -1 },
};

export function swingDoorOrientationForFace(face: SwingDoorFace): SwingDoorOrientation {
  return ORIENTATIONS[face];
}

/** Effective swing sign — flipped when the door opens inward (into the private side). */
export function swingDoorEffectiveSwingSign(face: SwingDoorFace, swingInward: boolean): 1 | -1 {
  const s = ORIENTATIONS[face].swingSign;
  return swingInward ? ((-s) as 1 | -1) : s;
}

export function swingDoorYawRad(
  face: SwingDoorFace,
  open01: number,
  maxRad: number,
  swingInward: boolean = false,
): number {
  const o = ORIENTATIONS[face];
  const sign = swingInward ? -o.swingSign : o.swingSign;
  return o.baseYaw + sign * open01 * maxRad;
}

/** Convert a face label to/from a compact `u8` (matches Rust `DoorFace` ordering). */
export const FACE_CODE: Record<SwingDoorFace, number> = { n: 0, s: 1, e: 2, w: 3 };
export const FACE_FROM_CODE: SwingDoorFace[] = ["n", "s", "e", "w"];

/** Direction (axis-aligned unit vector) the wall normal points from room into corridor for `face`. */
export function swingDoorOpenSideNormal(face: SwingDoorFace): { x: number; z: number } {
  switch (face) {
    case "w":
      return { x: -1, z: 0 };
    case "e":
      return { x: 1, z: 0 };
    case "n":
      return { x: 0, z: 1 };
    case "s":
      return { x: 0, z: -1 };
  }
}

/** Direction the leaf TIP ends up at full-open (unit vector). Inward swing negates the normal
 *  so the tip lands on the PRIVATE (unit) side instead of the corridor side. */
export function swingDoorTipDirAtFullOpen(
  face: SwingDoorFace,
  swingInward: boolean,
): { x: number; z: number } {
  const n = swingDoorOpenSideNormal(face);
  return swingInward ? { x: -n.x, z: -n.z } : n;
}

/** Direction the leaf at-rest extends along the wall (from hinge → tip), unit vector. */
export function swingDoorTangentRest(face: SwingDoorFace): { x: number; z: number } {
  switch (face) {
    case "w":
    case "e":
      return { x: 0, z: -1 };
    case "n":
    case "s":
      return { x: -1, z: 0 };
  }
}

/**
 * Closed-door collision slab in world space. A thin plate that fills the doorway opening.
 *
 * The opening spans `panelWidthM` along the wall tangent, anchored at `hingeXZ` and extending in
 * `swingDoorTangentRest(face)`. The slab is `SWING_DOOR_CLOSED_SLAB_HALF_THICK_M` thick on each
 * side of the wall plane.
 */
export function swingDoorClosedSlabAabb(opts: {
  face: SwingDoorFace;
  hingeX: number;
  hingeZ: number;
  feetY: number;
  panelWidthM: number;
  panelHeightM: number;
}): CollisionAabb {
  const t = SWING_DOOR_CLOSED_SLAB_HALF_THICK_M;
  const tan = swingDoorTangentRest(opts.face);
  const tipX = opts.hingeX + tan.x * opts.panelWidthM;
  const tipZ = opts.hingeZ + tan.z * opts.panelWidthM;
  const xMin = Math.min(opts.hingeX, tipX);
  const xMax = Math.max(opts.hingeX, tipX);
  const zMin = Math.min(opts.hingeZ, tipZ);
  const zMax = Math.max(opts.hingeZ, tipZ);
  // Expand along wall normal axis only.
  if (opts.face === "w" || opts.face === "e") {
    return {
      min: [opts.hingeX - t, opts.feetY, zMin],
      max: [opts.hingeX + t, opts.feetY + opts.panelHeightM, zMax],
    };
  }
  return {
    min: [xMin, opts.feetY, opts.hingeZ - t],
    max: [xMax, opts.feetY + opts.panelHeightM, opts.hingeZ + t],
  };
}

/**
 * Conservative AABB for the open leaf at-rest (perpendicular to the closed position).
 * Padded by `SWING_DOOR_OPEN_LEAF_XZ_PAD_M` to cover client-prediction jitter.
 *
 * The AABB spans the length of the panel along `tipDir` (normal-axis) and straddles the hinge
 * plane by `halfThick + pad` on the tangent axis — that's where the real leaf lives when fully
 * open, regardless of inward vs outward swing.
 */
export function swingDoorParkedLeafAabb(opts: {
  face: SwingDoorFace;
  hingeX: number;
  hingeZ: number;
  feetY: number;
  panelWidthM: number;
  panelHeightM: number;
  /** Direction of swing. Defaults to `false` (outward / into the corridor). */
  swingInward?: boolean;
}): CollisionAabb {
  const ht = SWING_DOOR_OPEN_LEAF_HALF_THICK_M;
  const pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
  const tip = swingDoorTipDirAtFullOpen(opts.face, opts.swingInward ?? false);
  const tipX = opts.hingeX + tip.x * opts.panelWidthM;
  const tipZ = opts.hingeZ + tip.z * opts.panelWidthM;
  if (opts.face === "w" || opts.face === "e") {
    const xMin = Math.min(opts.hingeX, tipX) - pad;
    const xMax = Math.max(opts.hingeX, tipX) + pad;
    return {
      min: [xMin, opts.feetY, opts.hingeZ - ht - pad],
      max: [xMax, opts.feetY + opts.panelHeightM, opts.hingeZ + ht + pad],
    };
  }
  const zMin = Math.min(opts.hingeZ, tipZ) - pad;
  const zMax = Math.max(opts.hingeZ, tipZ) + pad;
  return {
    min: [opts.hingeX - ht - pad, opts.feetY, zMin],
    max: [opts.hingeX + ht + pad, opts.feetY + opts.panelHeightM, zMax],
  };
}

/** True when the door's `open01` puts it in the closed-slab collision regime. */
export function swingDoorClosedSlabActive(open01: number): boolean {
  return open01 <= SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01;
}

/** True when the door's `open01` puts the leaf in the parked-open collision regime. */
export function swingDoorParkedLeafActive(open01: number): boolean {
  return open01 >= SWING_DOOR_PARKED_LEAF_MIN_OPEN_01;
}

/** Player-feet test for E-key interaction eligibility. */
export function swingDoorPlayerInInteractRange(opts: {
  hingeX: number;
  hingeZ: number;
  feetY: number;
  panelWidthM: number;
  panelHeightM: number;
  px: number;
  py: number;
  pz: number;
}): boolean {
  const dx = opts.px - opts.hingeX;
  const dz = opts.pz - opts.hingeZ;
  const r = SWING_DOOR_INTERACT_RADIUS_M + opts.panelWidthM * 0.5;
  if (dx * dx + dz * dz > r * r) return false;
  const cy = opts.feetY + opts.panelHeightM * 0.5;
  return Math.abs(opts.py - cy) <= SWING_DOOR_INTERACT_Y_HALF_M;
}

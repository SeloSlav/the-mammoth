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
 *   - **outward** (default, used by elevator landing and apartment corridor doors): leaf swings into the public /
 *     corridor side — i.e. along `swingDoorOpenSideNormal(face)`.
 *   - **inward**: leaf swings into the private / unit side — i.e.
 *     along `-swingDoorOpenSideNormal(face)`.
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
export const SWING_DOOR_ANIM_SPEED = 4.5;

/** Open01 below this counts as "essentially closed" for collision purposes. */
export const SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01 = 0.025;

/** Open01 at/above this counts as "fully parked open" for analytics / leaf geometry tests. */
export const SWING_DOOR_PARKED_LEAF_MIN_OPEN_01 = 0.97;

/** When `open01 >= this` the door no longer obstructs passage. */
export const SWING_DOOR_PASSAGE_OPEN_THRESH = 0.85;

/** Default max swing in radians when the kit doesn't override.
 *  ~89° (1.55 rad) parks the leaf nearly perpendicular to the wall so the parked-leaf AABB
 *  matches the rendered geometry (the leaf clears the doorway opening, sitting flat against
 *  the corridor side of the wall). Matches `content/elevator/landing_kit.json`. */
export const SWING_DOOR_DEFAULT_MAX_RAD = 1.55;

/** Interaction radius (world meters) — player must be within this XZ distance of the hinge. */
export const SWING_DOOR_INTERACT_RADIUS_M = 2.05;
/** Legacy narrow band (panel mid-Y ± half). Prefer {@link SWING_DOOR_INTERACT_FEET_*_SLACK_M}. */
export const SWING_DOOR_INTERACT_Y_HALF_M = 1.55;
/** Feet may sit this far below the door sill (elevator shafts, drops onto cab roofs). */
export const SWING_DOOR_INTERACT_FEET_BELOW_SLACK_M = 10.0;
/** Feet may sit this far above the door head (standing on cab roof above landing, tall poses). */
export const SWING_DOOR_INTERACT_FEET_ABOVE_HEAD_SLACK_M = 4.25;

/** Uniform XZ inflation on parked-open leaf firearm barriers (decals + hit-scan grazing). */
export const SWING_DOOR_FIREARM_PARKED_LEAF_UNIFORM_PAD_M = 0.22;

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
 * The AABB spans the length of the panel along `tipDir` (normal-axis), offset by `halfThick`
 * on the tangent axis.
 *
 * ## Asymmetric hinge-axis padding
 *
 * The real leaf rotates 90° onto exactly ONE side of the wall plane (corridor side when
 * outward, unit side when inward) — it NEVER physically crosses the hinge plane. The AABB
 * must not either, because any overlap of the hinge-axis pad on the "wrong" side of the wall
 * depenetrates the player across the threshold and produces the "rubber-banding at the
 * doorway" behavior. So the pad is only added on the TIP side (the side the leaf actually
 * lives on); the wall side of the AABB sits flush on the hinge plane minus `halfThick`.
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
    // Hinge side is flush with the wall plane (NO cross-threshold pad); tip side extends
    // the full panel length plus jitter pad.
    const xMin = tip.x > 0 ? opts.hingeX : tipX - pad;
    const xMax = tip.x > 0 ? tipX + pad : opts.hingeX;
    return {
      min: [xMin, opts.feetY, opts.hingeZ - ht - pad],
      max: [xMax, opts.feetY + opts.panelHeightM, opts.hingeZ + ht + pad],
    };
  }
  const zMin = tip.z > 0 ? opts.hingeZ : tipZ - pad;
  const zMax = tip.z > 0 ? tipZ + pad : opts.hingeZ;
  return {
    min: [opts.hingeX - ht - pad, opts.feetY, zMin],
    max: [opts.hingeX + ht + pad, opts.feetY + opts.panelHeightM, zMax],
  };
}

/** True when the door's `open01` puts it in the closed-slab collision regime. */
export function swingDoorClosedSlabActive(open01: number): boolean {
  return open01 <= SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01;
}

/** True when `open01` is in the parked-open band (renderer/analytics — locomotion uses hull collision beyond closed slab). */
export function swingDoorParkedLeafActive(open01: number): boolean {
  return open01 >= SWING_DOOR_PARKED_LEAF_MIN_OPEN_01;
}

/**
 * Axis-aligned hull of the swinging leaf for locomotion when the door is no longer in the closed-slab regime.
 * Matches `(-sin(yaw), -cos(yaw))` tip displacement used by rendering (`swingDoorYawRad`).
 */
export function swingDoorSwingingLeafEnclosingAabb(opts: {
  face: SwingDoorFace;
  hingeX: number;
  hingeZ: number;
  feetY: number;
  panelWidthM: number;
  panelHeightM: number;
  open01: number;
  maxSwingRad: number;
  swingInward?: boolean;
}): CollisionAabb {
  const ht = SWING_DOOR_OPEN_LEAF_HALF_THICK_M;
  const pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
  const yaw = swingDoorYawRad(opts.face, opts.open01, opts.maxSwingRad, opts.swingInward);
  const ux = -Math.sin(yaw);
  const uz = -Math.cos(yaw);
  const vx = -uz;
  const vz = ux;
  const hx = opts.hingeX;
  const hz = opts.hingeZ;
  const corners: [number, number][] = [
    [hx + vx * ht, hz + vz * ht],
    [hx - vx * ht, hz - vz * ht],
    [hx + vx * ht + ux * opts.panelWidthM, hz + vz * ht + uz * opts.panelWidthM],
    [hx - vx * ht + ux * opts.panelWidthM, hz - vz * ht + uz * opts.panelWidthM],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of corners) {
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minZ = Math.min(minZ, z - pad);
    maxZ = Math.max(maxZ, z + pad);
  }
  return {
    min: [minX, opts.feetY, minZ],
    max: [maxX, opts.feetY + opts.panelHeightM, maxZ],
  };
}

/**
 * Player capsule / locomotion: closed doorway slab while nearly shut; once it opens, the swinging leaf
 * hull blocks the parked panel (corridor-outward apartment doors need solid cover).
 */
export function swingDoorMovementBlockingAabb(opts: {
  open01: number;
  face: SwingDoorFace;
  hingeX: number;
  hingeZ: number;
  feetY: number;
  panelWidthM: number;
  panelHeightM: number;
  swingInward?: boolean;
  /** Kit/authored max swing; defaults to {@link SWING_DOOR_DEFAULT_MAX_RAD}. */
  maxSwingRad?: number;
}): CollisionAabb | null {
  if (swingDoorClosedSlabActive(opts.open01)) {
    return swingDoorClosedSlabAabb({
      face: opts.face,
      hingeX: opts.hingeX,
      hingeZ: opts.hingeZ,
      feetY: opts.feetY,
      panelWidthM: opts.panelWidthM,
      panelHeightM: opts.panelHeightM,
    });
  }
  const maxSwingRad = opts.maxSwingRad ?? SWING_DOOR_DEFAULT_MAX_RAD;
  return swingDoorSwingingLeafEnclosingAabb({
    face: opts.face,
    hingeX: opts.hingeX,
    hingeZ: opts.hingeZ,
    feetY: opts.feetY,
    panelWidthM: opts.panelWidthM,
    panelHeightM: opts.panelHeightM,
    open01: opts.open01,
    maxSwingRad,
    swingInward: opts.swingInward,
  });
}

/**
 * Matches {@link fpBlockerAABBs}.`DOORWAY_COLLISION_INSET_M` (`fpBlockerAABBs.ts`):
 * doorway **static** solids are trimmed this far for forgiving capsule movement. The visible jamb +
 * trimmed region is wider than the thin closed swing slab alone, which lets LOS slip through unless
 * hit-scan/decals widen the firearm barrier along the doorway tangent (server + client decals).
 */
export const SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M = 0.6;

/** Extra closed-slab half-thickness vs movement collision — tightens grazing shots along the wall normal. */
export const SWING_DOOR_HITSCAN_CLOSED_NORMAL_HALF_EXTRA_M = 0.035;

/** Expands movement `swingDoorClosedSlabAabb` for firearm ray vs decal traces only. */
export function expandSwingDoorClosedSlabAabbForFirearmLOS(
  slab: CollisionAabb,
  face: SwingDoorFace,
): CollisionAabb {
  const p = SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M;
  const e = SWING_DOOR_HITSCAN_CLOSED_NORMAL_HALF_EXTRA_M;
  const mn: [number, number, number] = [slab.min[0], slab.min[1], slab.min[2]];
  const mx: [number, number, number] = [slab.max[0], slab.max[1], slab.max[2]];
  if (face === "w" || face === "e") {
    mn[2] -= p;
    mx[2] += p;
    mn[0] -= e;
    mx[0] += e;
  } else {
    mn[0] -= p;
    mx[0] += p;
    mn[2] -= e;
    mx[2] += e;
  }
  return { min: mn, max: mx };
}

/** Broader pad for parked-open leaf firearm traces (any orientation). */
export function expandSwingDoorFirearmParkedLeafAabb(leaf: CollisionAabb): CollisionAabb {
  const e = SWING_DOOR_FIREARM_PARKED_LEAF_UNIFORM_PAD_M;
  const ey = 0.05;
  return {
    min: [leaf.min[0] - e, leaf.min[1] - ey, leaf.min[2] - e],
    max: [leaf.max[0] + e, leaf.max[1] + ey, leaf.max[2] + e],
  };
}

/**
 * LOS / impact-decal blocker for swing doors.
 *
 * - Nearly closed: expanded closed slab (jamb-gap cheats).
 * - Mid swing (between closed slab max and passage): still uses expanded closed slab (conservative).
 * - At/above passage openness: **parked leaf** volume so shots/decals hit the open panel instead of
 *   flying through trimmed static doorway holes.
 */
export function swingDoorFirearmBarrierAabb(opts: {
  open01: number;
  face: SwingDoorFace;
  hingeX: number;
  hingeZ: number;
  feetY: number;
  panelWidthM: number;
  panelHeightM: number;
  swingInward?: boolean;
}): CollisionAabb | null {
  const closedBase = swingDoorClosedSlabAabb({
    face: opts.face,
    hingeX: opts.hingeX,
    hingeZ: opts.hingeZ,
    feetY: opts.feetY,
    panelWidthM: opts.panelWidthM,
    panelHeightM: opts.panelHeightM,
  });

  if (opts.open01 <= SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01) {
    return expandSwingDoorClosedSlabAabbForFirearmLOS(closedBase, opts.face);
  }

  if (opts.open01 >= SWING_DOOR_PASSAGE_OPEN_THRESH) {
    const leaf = swingDoorParkedLeafAabb({
      face: opts.face,
      hingeX: opts.hingeX,
      hingeZ: opts.hingeZ,
      feetY: opts.feetY,
      panelWidthM: opts.panelWidthM,
      panelHeightM: opts.panelHeightM,
      swingInward: opts.swingInward,
    });
    return expandSwingDoorFirearmParkedLeafAabb(leaf);
  }

  return expandSwingDoorClosedSlabAabbForFirearmLOS(closedBase, opts.face);
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
  const yLo = opts.feetY - SWING_DOOR_INTERACT_FEET_BELOW_SLACK_M;
  const yHi =
    opts.feetY + opts.panelHeightM + SWING_DOOR_INTERACT_FEET_ABOVE_HEAD_SLACK_M;
  return opts.py >= yLo && opts.py <= yHi;
}

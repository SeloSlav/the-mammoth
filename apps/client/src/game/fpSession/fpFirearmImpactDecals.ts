import * as THREE from "three";
import type { HeldItemId } from "@the-mammoth/game";
import {
  FP_FIREARM_HITSCAN_SHOTGUN_SPREAD_RAD,
  fpFirearmHitscanPelletCountForHeldItem,
  fpFirearmHitscanRangeMForHeldItem,
} from "@the-mammoth/engine";
import {
  FP_OUTDOOR_GROUND_VISUAL_Y,
  type CollisionAabb,
  type CollisionSpatialIndex,
} from "@the-mammoth/world";

export type VisitSolidAabbInXZFn = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  visit: (aabb: CollisionAabb) => void,
) => void;

const DECAL_GROUP_NAME = "fp_firearm_impact_decals";
const MAX_DECALS = 56;
const DECAL_TTL_MS = 5200;
const SURFACE_BIAS_M = 0.004;
const PISTOL_RADIUS_M = 0.044;
const SHOTGUN_PELLET_RADIUS_M = 0.032;
const XZ_QUERY_PAD_M = 1.0;
const RAY_DIR_EPS = 1e-12;
const RAY_MIN_T_M = 0.04;

type DecalSlot = {
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  birthMs: number;
};

function pelletR01(seq: number, pelletIdx: number, salt: number): number {
  let x = seq ^ Math.imul(pelletIdx, 0x27d4eb2d) ^ Math.imul(salt, 0x165667b1);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return (x >>> 0) / 0x1_0000_0000;
}

function spreadUnitVector(
  forward: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  spreadRad: number,
  u1: number,
  u2: number,
  out: THREE.Vector3,
): void {
  const r = spreadRad * Math.sqrt(Math.max(0, Math.min(1, u1)));
  const theta = u2 * Math.PI * 2;
  out.copy(forward);
  out.addScaledVector(right, Math.cos(theta) * r);
  out.addScaledVector(up, Math.sin(theta) * r);
  out.normalize();
}

/**
 * Ray vs axis-aligned box; returns **entry** distance in [0, tMax] when the ray starts outside the box.
 * Omits hits when the origin lies inside the AABB (camera intersecting collision proxy).
 */
function rayAabbEntryT(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  tMax: number,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): number | null {
  let t0 = 0;
  let t1 = tMax;

  const slab = (
    o: number,
    d: number,
    bn: number,
    bx: number,
  ): boolean => {
    if (Math.abs(d) < RAY_DIR_EPS) {
      if (o < bn || o > bx) return false;
      return true;
    }
    const invD = 1 / d;
    let tn = (bn - o) * invD;
    let tf = (bx - o) * invD;
    if (tn > tf) {
      const s = tn;
      tn = tf;
      tf = s;
    }
    t0 = tn > t0 ? tn : t0;
    t1 = tf < t1 ? tf : t1;
    return t0 <= t1;
  };

  if (!slab(ox, dx, min[0], max[0])) return null;
  if (!slab(oy, dy, min[1], max[1])) return null;
  if (!slab(oz, dz, min[2], max[2])) return null;

  if (t1 < 0 || t0 > tMax) return null;
  /** Origin inside solid — skip instead of picking an exit face. */
  if (t0 < 0 && t1 > 0) return null;
  const tHit = t0 >= 0 ? t0 : t1;
  if (tHit < RAY_MIN_T_M || tHit > tMax) return null;
  return tHit;
}

function normalTowardShooterAtAabbSurface(
  px: number,
  py: number,
  pz: number,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  sx: number,
  sy: number,
  sz: number,
  out: THREE.Vector3,
): void {
  const cx = (min[0] + max[0]) * 0.5;
  const cy = (min[1] + max[1]) * 0.5;
  const cz = (min[2] + max[2]) * 0.5;
  const ex = Math.max(1e-6, (max[0] - min[0]) * 0.5);
  const ey = Math.max(1e-6, (max[1] - min[1]) * 0.5);
  const ez = Math.max(1e-6, (max[2] - min[2]) * 0.5);
  const vx = (px - cx) / ex;
  const vy = (py - cy) / ey;
  const vz = (pz - cz) / ez;
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  const az = Math.abs(vz);
  if (ax >= ay && ax >= az) {
    out.set(Math.sign(vx) || -Math.sign(sx), 0, 0);
  } else if (ay >= ax && ay >= az) {
    out.set(0, Math.sign(vy) || -Math.sign(sy), 0);
  } else {
    out.set(0, 0, Math.sign(vz) || -Math.sign(sz));
  }
  if (out.lengthSq() < 1e-12) {
    out.set(-sx, -sy, -sz);
  } else {
    out.normalize();
  }
}

function segmentXzQueryBounds(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  tMax: number,
): { x0: number; x1: number; z0: number; z1: number } {
  const ex = ox + dx * tMax;
  const ez = oz + dz * tMax;
  const p = XZ_QUERY_PAD_M;
  return {
    x0: Math.min(ox, ex) - p,
    x1: Math.max(ox, ex) + p,
    z0: Math.min(oz, ez) - p,
    z1: Math.max(oz, ez) + p,
  };
}

function traceOutdoorGroundPlaneT(
  oy: number,
  dy: number,
  tMax: number,
  groundY: number,
): number | null {
  if (dy >= -RAY_DIR_EPS) return null;
  const t = (groundY - oy) / dy;
  if (t < RAY_MIN_T_M || t > tMax) return null;
  return t;
}

export type FpFirearmImpactDecals = {
  spawnForShot: (args: {
    nowMs: number;
    camera: THREE.PerspectiveCamera;
    aimWorldDir: THREE.Vector3;
    heldItemId: HeldItemId;
    shotSeq: number;
  }) => void;
  tick: (nowMs: number) => void;
  dispose: () => void;
};

export function createFpFirearmImpactDecals(opts: {
  scene: THREE.Scene;
  staticCollisionIndex: CollisionSpatialIndex;
  visitExtraSolidAabbsInXZ?: VisitSolidAabbInXZFn;
}): FpFirearmImpactDecals {
  const group = new THREE.Group();
  group.name = DECAL_GROUP_NAME;
  opts.scene.add(group);

  const sharedGeomPistol = new THREE.CircleGeometry(PISTOL_RADIUS_M, 24);
  const sharedGeomPellet = new THREE.CircleGeometry(SHOTGUN_PELLET_RADIUS_M, 18);
  const sharedMaterial = new THREE.MeshBasicMaterial({
    color: 0x1a1816,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1.25,
    polygonOffsetUnits: -1.25,
  });

  const pool: DecalSlot[] = [];
  for (let i = 0; i < MAX_DECALS; i += 1) {
    const mesh = new THREE.Mesh(sharedGeomPistol, sharedMaterial.clone());
    mesh.name = "fp_firearm_impact_decal";
    mesh.renderOrder = 2;
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    pool.push({ mesh, active: false, birthMs: 0 });
  }

  const actives: DecalSlot[] = [];

  const scratch = {
    origin: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
  };
  const upRef = new THREE.Vector3(0, 1, 0);

  const trimExcess = (): void => {
    while (actives.length > MAX_DECALS) {
      const old = actives.shift()!;
      old.active = false;
      old.mesh.visible = false;
    }
  };

  const acquireSlot = (): DecalSlot | null => {
    for (const slot of pool) {
      if (!slot.active) return slot;
    }
    if (actives.length === 0) return null;
    const recycled = actives.shift()!;
    recycled.active = false;
    recycled.mesh.visible = false;
    return recycled;
  };

  const spawnOneAt = (
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number,
    shotDirX: number,
    shotDirY: number,
    shotDirZ: number,
    radiusGeom: THREE.CircleGeometry,
    birthMs: number,
  ): void => {
    const slot = acquireSlot();
    if (!slot) return;

    scratch.normal.set(nx, ny, nz);
    if (scratch.normal.lengthSq() < 1e-12) {
      scratch.normal.set(-shotDirX, -shotDirY, -shotDirZ).normalize();
    }
    if (
      scratch.normal.x * shotDirX +
        scratch.normal.y * shotDirY +
        scratch.normal.z * shotDirZ >
      0
    ) {
      scratch.normal.negate();
    }
    scratch.pos.set(px, py, pz).addScaledVector(scratch.normal, SURFACE_BIAS_M);

    const mesh = slot.mesh;
    if (mesh.geometry !== radiusGeom) {
      mesh.geometry = radiusGeom;
    }
    mesh.position.copy(scratch.pos);
    scratch.quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), scratch.normal);
    mesh.quaternion.copy(scratch.quat);
    mesh.visible = true;

    slot.active = true;
    slot.birthMs = birthMs;
    actives.push(slot);
    trimExcess();
  };

  const traceSolidOrGround = (
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    range: number,
    geom: THREE.CircleGeometry,
    nowMs: number,
  ): void => {
    const xz = segmentXzQueryBounds(ox, oz, dx, dz, range);
    let bestT = Infinity;
    let bestMin: readonly [number, number, number] | null = null;
    let bestMax: readonly [number, number, number] | null = null;

    opts.staticCollisionIndex.visitAabbsInXZ(xz.x0, xz.x1, xz.z0, xz.z1, (aabb) => {
      const t = rayAabbEntryT(ox, oy, oz, dx, dy, dz, range, aabb.min, aabb.max);
      if (t !== null && t < bestT) {
        bestT = t;
        bestMin = aabb.min;
        bestMax = aabb.max;
      }
    });

    opts.visitExtraSolidAabbsInXZ?.(xz.x0, xz.x1, xz.z0, xz.z1, (aabb) => {
      const t = rayAabbEntryT(ox, oy, oz, dx, dy, dz, range, aabb.min, aabb.max);
      if (t !== null && t < bestT) {
        bestT = t;
        bestMin = aabb.min;
        bestMax = aabb.max;
      }
    });

    let tHit: number | null = bestT < Infinity ? bestT : null;
    let useGround = false;
    if (tHit === null) {
      const tg = traceOutdoorGroundPlaneT(oy, dy, range, FP_OUTDOOR_GROUND_VISUAL_Y);
      if (tg !== null) {
        tHit = tg;
        useGround = true;
      }
    }

    if (tHit === null) return;

    const px = ox + dx * tHit;
    const py = oy + dy * tHit;
    const pz = oz + dz * tHit;

    if (useGround) {
      spawnOneAt(px, py, pz, 0, 1, 0, dx, dy, dz, geom, nowMs);
      return;
    }

    if (!bestMin || !bestMax) return;
    normalTowardShooterAtAabbSurface(
      px,
      py,
      pz,
      bestMin,
      bestMax,
      dx,
      dy,
      dz,
      scratch.normal,
    );
    spawnOneAt(
      px,
      py,
      pz,
      scratch.normal.x,
      scratch.normal.y,
      scratch.normal.z,
      dx,
      dy,
      dz,
      geom,
      nowMs,
    );
  };

  return {
    spawnForShot(args: {
      nowMs: number;
      camera: THREE.PerspectiveCamera;
      aimWorldDir: THREE.Vector3;
      heldItemId: HeldItemId;
      shotSeq: number;
    }): void {
      const range = fpFirearmHitscanRangeMForHeldItem(args.heldItemId);
      if (range == null) return;

      args.camera.updateMatrixWorld(true);
      args.camera.getWorldPosition(scratch.origin);
      const ox = scratch.origin.x;
      const oy = scratch.origin.y;
      const oz = scratch.origin.z;

      const pelletCount = fpFirearmHitscanPelletCountForHeldItem(args.heldItemId);
      const spread =
        args.heldItemId === "shotgun-coach" ? FP_FIREARM_HITSCAN_SHOTGUN_SPREAD_RAD : 0;

      scratch.fwd.copy(args.aimWorldDir).normalize();
      scratch.right.crossVectors(upRef, scratch.fwd);
      if (scratch.right.lengthSq() < 1e-12) {
        scratch.right.set(1, 0, 0).cross(scratch.fwd);
      }
      scratch.right.normalize();
      scratch.up.crossVectors(scratch.fwd, scratch.right).normalize();

      const geom =
        pelletCount > 1 ? sharedGeomPellet : sharedGeomPistol;

      for (let i = 0; i < pelletCount; i++) {
        if (spread > 0 && pelletCount > 1) {
          const u1 = pelletR01(args.shotSeq, i, 0xa2c7);
          const u2 = pelletR01(args.shotSeq, i, 0x5e3d);
          spreadUnitVector(scratch.fwd, scratch.right, scratch.up, spread, u1, u2, scratch.dir);
        } else {
          scratch.dir.copy(scratch.fwd);
        }

        traceSolidOrGround(
          ox,
          oy,
          oz,
          scratch.dir.x,
          scratch.dir.y,
          scratch.dir.z,
          range,
          geom,
          args.nowMs,
        );
      }
    },

    tick(nowMs: number): void {
      for (let i = actives.length - 1; i >= 0; i--) {
        const d = actives[i]!;
        const u = (nowMs - d.birthMs) / DECAL_TTL_MS;
        if (u >= 1) {
          d.active = false;
          d.mesh.visible = false;
          actives.splice(i, 1);
          continue;
        }
        d.mesh.material.opacity = 1 - u;
      }
    },

    dispose(): void {
      for (const slot of pool) {
        slot.active = false;
        slot.mesh.visible = false;
        slot.mesh.material.dispose();
        group.remove(slot.mesh);
      }
      pool.length = 0;
      actives.length = 0;
      sharedMaterial.dispose();
      opts.scene.remove(group);
      sharedGeomPistol.dispose();
      sharedGeomPellet.dispose();
    },
  };
}

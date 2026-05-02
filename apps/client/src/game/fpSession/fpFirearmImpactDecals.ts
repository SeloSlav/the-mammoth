import * as THREE from "three";
import type { HeldItemId } from "@the-mammoth/game";
import {
  FP_FIREARM_HITSCAN_SHOTGUN_SPREAD_RAD,
  fpFirearmHitscanPelletCountForHeldItem,
  fpFirearmHitscanRangeMForHeldItem,
} from "@the-mammoth/engine";

const DECAL_GROUP_NAME = "fp_firearm_impact_decals";
const MAX_DECALS = 56;
const DECAL_TTL_MS = 5200;
const SURFACE_BIAS_M = 0.004;
const PISTOL_RADIUS_M = 0.044;
const SHOTGUN_PELLET_RADIUS_M = 0.032;

const REMOTE_PLAYER_ROOT_NAME = "remote_player_body";

type ActiveDecal = {
  mesh: THREE.Mesh<
    THREE.CircleGeometry,
    THREE.MeshBasicMaterial
  >;
  birthMs: number;
};

function isUnderRemotePlayerRoot(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.name === REMOTE_PLAYER_ROOT_NAME) return true;
    cur = cur.parent;
  }
  return false;
}

function shouldSkipDecalSurface(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.userData.mammothApartmentUnitBoundsDebug === true) return true;
    cur = cur.parent;
  }
  return false;
}

function pelletRng01(shotSeq: number, pelletIdx: number, salt: number): number {
  let x = shotSeq ^ Math.imul(pelletIdx, 0x27d4eb2d) ^ Math.imul(salt, 0x165667b1);
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

function pickFirstDecalHit(hits: THREE.Intersection[]): THREE.Intersection | null {
  for (const h of hits) {
    if (!(h.object instanceof THREE.Mesh)) continue;
    if (isUnderRemotePlayerRoot(h.object)) continue;
    if (shouldSkipDecalSurface(h.object)) continue;
    return h;
  }
  return null;
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
  raycastRoots: THREE.Object3D[];
}): FpFirearmImpactDecals {
  const group = new THREE.Group();
  group.name = DECAL_GROUP_NAME;
  opts.scene.add(group);

  const sharedGeomPistol = new THREE.CircleGeometry(PISTOL_RADIUS_M, 24);
  const sharedGeomPellet = new THREE.CircleGeometry(SHOTGUN_PELLET_RADIUS_M, 18);

  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(0);

  const actives: ActiveDecal[] = [];

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
      group.remove(old.mesh);
      old.mesh.material.dispose();
    }
  };

  const spawnOne = (hit: THREE.Intersection, radiusGeom: THREE.CircleGeometry, birthMs: number): void => {
    const mesh = new THREE.Mesh(
      radiusGeom,
      new THREE.MeshBasicMaterial({
        color: 0x1a1816,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1.25,
        polygonOffsetUnits: -1.25,
      }),
    );
    mesh.name = "fp_firearm_impact_decal";
    mesh.renderOrder = 2;

    const n = scratch.normal;
    const faceN = hit.face?.normal;
    if (faceN) {
      n.copy(faceN).transformDirection(hit.object.matrixWorld);
    } else {
      n.copy(scratch.dir).negate();
    }
    n.normalize();

    scratch.pos.copy(hit.point).addScaledVector(n, SURFACE_BIAS_M);
    mesh.position.copy(scratch.pos);

    scratch.quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    mesh.quaternion.copy(scratch.quat);

    actives.push({ mesh, birthMs });
    group.add(mesh);
    trimExcess();
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
      if (opts.raycastRoots.length === 0) return;

      args.camera.updateMatrixWorld(true);
      args.camera.getWorldPosition(scratch.origin);

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
          const u1 = pelletRng01(args.shotSeq, i, 0xa2c7);
          const u2 = pelletRng01(args.shotSeq, i, 0x5e3d);
          spreadUnitVector(scratch.fwd, scratch.right, scratch.up, spread, u1, u2, scratch.dir);
        } else {
          scratch.dir.copy(scratch.fwd);
        }

        raycaster.set(scratch.origin, scratch.dir);
        raycaster.far = range;
        const hits = raycaster.intersectObjects(opts.raycastRoots, true);
        const hit = pickFirstDecalHit(hits);
        if (hit) spawnOne(hit, geom, args.nowMs);
      }
    },

    tick(nowMs: number): void {
      for (let i = actives.length - 1; i >= 0; i--) {
        const d = actives[i]!;
        const u = (nowMs - d.birthMs) / DECAL_TTL_MS;
        if (u >= 1) {
          group.remove(d.mesh);
          d.mesh.material.dispose();
          actives.splice(i, 1);
          continue;
        }
        d.mesh.material.opacity = 1 - u;
      }
    },

    dispose(): void {
      for (const d of actives) {
        group.remove(d.mesh);
        d.mesh.material.dispose();
      }
      actives.length = 0;
      opts.scene.remove(group);
      sharedGeomPistol.dispose();
      sharedGeomPellet.dispose();
    },
  };
}

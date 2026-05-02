import * as THREE from "three";
import type { CollisionAabb, CollisionSpatialIndex } from "@the-mammoth/world";
import {
  readFpCollisionDebugDraw,
  readFpPhysicsDebugOverlay,
} from "../fpPhysics/fpCollisionPolicy.js";
import type { DynamicCollisionQueryPose } from "../fpPhysics/fpPlayerCollision.js";
import {
  FP_PLAYER_COLLISION_HEIGHT_CROUCH_M,
  FP_PLAYER_COLLISION_HEIGHT_STAND_M,
  FP_PLAYER_COLLISION_RADIUS_M,
} from "../fpPhysics/fpPlayerCollision.js";

const PHYSICS_DEBUG_QUERY_RADIUS_M = 9;
const MAX_DEBUG_STATIC_AABBS = 40;
const MAX_DEBUG_DYNAMIC_AABBS = 24;

export type FpCollisionDebugOverlayContext = {
  staticCollisionIndex: CollisionSpatialIndex;
  visitDynamicCollisionAabbsInXZ: (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    queryPose?: DynamicCollisionQueryPose,
  ) => void;
};

/**
 * Lightweight runtime collision debug: feet ring + horizontal velocity arrow; optional full physics
 * overlay via localStorage (see `fpCollisionPolicy.ts`).
 */
export function createFpCollisionDebugOverlay(ctx: FpCollisionDebugOverlayContext): {
  group: THREE.Group;
  update(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    opts: {
      crouch: boolean;
      displayOffset: THREE.Vector3;
    },
  ): void;
} {
  const group = new THREE.Group();
  group.name = "fpCollisionDebug";

  const ringGeom = new THREE.RingGeometry(0.18, 0.24, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0.02, 0),
    0.6,
    0xff3366,
    0.08,
    0.06,
  );
  group.add(arrow);

  const rigRingGeom = new THREE.RingGeometry(0.14, 0.2, 24);
  const rigRingMat = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthTest: true,
  });
  const rigRing = new THREE.Mesh(rigRingGeom, rigRingMat);
  rigRing.rotation.x = -Math.PI / 2;
  rigRing.visible = false;
  group.add(rigRing);

  const capsuleMat = new THREE.LineBasicMaterial({ color: 0x66ccff, depthTest: true });
  const capsuleGeom = new THREE.BufferGeometry();
  const capsuleLine = new THREE.Line(capsuleGeom, capsuleMat);
  capsuleLine.visible = false;
  group.add(capsuleLine);

  const staticEdgesGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const staticLineMat = new THREE.LineBasicMaterial({
    color: 0x8899ff,
    transparent: true,
    opacity: 0.55,
    depthTest: true,
  });
  const dynamicLineMat = new THREE.LineBasicMaterial({
    color: 0xff66aa,
    transparent: true,
    opacity: 0.75,
    depthTest: true,
  });
  const staticPool: THREE.LineSegments[] = [];
  const dynamicPool: THREE.LineSegments[] = [];
  for (let i = 0; i < MAX_DEBUG_STATIC_AABBS; i++) {
    const line = new THREE.LineSegments(staticEdgesGeom, staticLineMat);
    line.visible = false;
    line.frustumCulled = false;
    group.add(line);
    staticPool.push(line);
  }
  for (let i = 0; i < MAX_DEBUG_DYNAMIC_AABBS; i++) {
    const line = new THREE.LineSegments(staticEdgesGeom, dynamicLineMat);
    line.visible = false;
    line.frustumCulled = false;
    group.add(line);
    dynamicPool.push(line);
  }

  let loggedPhysicsEngineNote = false;

  const scratchPose: DynamicCollisionQueryPose = {
    bodyX: 0,
    bodyFeetY: 0,
    bodyZ: 0,
  };

  const linePositions = new Float32Array(18);
  capsuleGeom.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  /**
   * Three vertical edges at 120° on the foot circle (group origin = physics feet).
   */
  const rebuildCapsuleLines = (bodyH: number, cx: number, cz: number): void => {
    const r = FP_PLAYER_COLLISION_RADIUS_M;
    const headY = bodyH;
    const feetY = 0;
    let o = 0;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      linePositions[o++] = x;
      linePositions[o++] = feetY;
      linePositions[o++] = z;
      linePositions[o++] = x;
      linePositions[o++] = headY;
      linePositions[o++] = z;
    }
    const posAttr = capsuleGeom.getAttribute("position") as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    capsuleGeom.computeBoundingSphere();
  };

  const placeAabb = (
    line: THREE.LineSegments,
    aabb: CollisionAabb,
    visible: boolean,
    origin: THREE.Vector3,
  ): void => {
    const dx = aabb.max[0] - aabb.min[0];
    const dy = aabb.max[1] - aabb.min[1];
    const dz = aabb.max[2] - aabb.min[2];
    const cx = (aabb.max[0] + aabb.min[0]) * 0.5;
    const cy = (aabb.max[1] + aabb.min[1]) * 0.5;
    const cz = (aabb.max[2] + aabb.min[2]) * 0.5;
    line.visible = visible;
    if (!visible) return;
    line.position.set(cx - origin.x, cy - origin.y, cz - origin.z);
    line.scale.set(Math.max(dx, 1e-4), Math.max(dy, 1e-4), Math.max(dz, 1e-4));
  };

  return {
    group,
    update(pos, vel, opts) {
      const basicOn = readFpCollisionDebugDraw();
      const physicsOn = readFpPhysicsDebugOverlay();
      const anyOn = basicOn || physicsOn;
      group.visible = anyOn;
      if (!anyOn) return;

      if (physicsOn && !loggedPhysicsEngineNote) {
        loggedPhysicsEngineNote = true;
        console.info(
          "[mmPhysicsDebug] FP uses custom AABB character controller (no Rapier). " +
            "Static walls are baked axis-aligned boxes — not GLTF trimesh colliders.",
        );
      }

      group.position.copy(pos);
      ring.visible = basicOn || physicsOn;
      arrow.visible = basicOn || physicsOn;

      const h = Math.hypot(vel.x, vel.z);
      if (h > 1e-4) {
        arrow.setDirection(new THREE.Vector3(vel.x / h, 0, vel.z / h));
        arrow.setLength(Math.min(1.2, h * 0.25), 0.08, 0.06);
      }
      arrow.visible = (basicOn || physicsOn) && h > 1e-4;

      const bodyH = opts.crouch ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M : FP_PLAYER_COLLISION_HEIGHT_STAND_M;

      if (physicsOn) {
        rebuildCapsuleLines(bodyH, 0, 0);
        capsuleLine.visible = true;

        const ox = opts.displayOffset.x;
        const oz = opts.displayOffset.z;
        const showRig = Math.hypot(ox, oz) > 0.004;
        rigRing.visible = showRig;
        if (showRig) {
          rigRing.position.set(ox, 0.015, oz);
        }

        const r = PHYSICS_DEBUG_QUERY_RADIUS_M;
        const px = pos.x;
        const pz = pos.z;
        scratchPose.bodyX = px;
        scratchPose.bodyFeetY = pos.y;
        scratchPose.bodyZ = pz;

        let si = 0;
        ctx.staticCollisionIndex.visitAabbsInXZ(px - r, px + r, pz - r, pz + r, (aabb) => {
          if (aabb.max[1] < pos.y - 0.05 || aabb.min[1] > pos.y + bodyH + 0.2) return;
          if (si < staticPool.length) {
            placeAabb(staticPool[si++]!, aabb, true, pos);
          }
        });
        for (; si < staticPool.length; si++) {
          staticPool[si]!.visible = false;
        }

        const dyn: CollisionAabb[] = [];
        ctx.visitDynamicCollisionAabbsInXZ(
          px - r,
          px + r,
          pz - r,
          pz + r,
          (a) => {
            dyn.push(a);
          },
          scratchPose,
        );
        dyn.sort(
          (a, b) =>
            Math.hypot(
              (a.min[0] + a.max[0]) * 0.5 - px,
              (a.min[2] + a.max[2]) * 0.5 - pz,
            ) -
            Math.hypot(
              (b.min[0] + b.max[0]) * 0.5 - px,
              (b.min[2] + b.max[2]) * 0.5 - pz,
            ),
        );
        let di = 0;
        const dlim = Math.min(dyn.length, dynamicPool.length);
        for (; di < dlim; di++) {
          const a = dyn[di]!;
          if (a.max[1] < pos.y - 0.05 || a.min[1] > pos.y + bodyH + 0.25) {
            placeAabb(dynamicPool[di]!, a, false, pos);
            continue;
          }
          placeAabb(dynamicPool[di]!, a, true, pos);
        }
        for (; di < dynamicPool.length; di++) {
          dynamicPool[di]!.visible = false;
        }
      } else {
        capsuleLine.visible = false;
        rigRing.visible = false;
        for (const line of staticPool) line.visible = false;
        for (const line of dynamicPool) line.visible = false;
      }
    },
  };
}

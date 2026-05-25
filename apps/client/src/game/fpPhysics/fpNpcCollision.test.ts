import { describe, expect, it } from "vitest";
import type { CollisionAabb } from "@the-mammoth/world";
import * as THREE from "three";
import { buildCollisionSpatialIndex } from "@the-mammoth/world";
import { BABUSHKA_BODY_RADIUS_M } from "@the-mammoth/game";
import { createFpNpcCollisionSource } from "./fpNpcCollision.js";
import { FP_PLAYER_COLLISION_RADIUS_M, resolvePlayerCollisions } from "./fpPlayerCollision.js";

describe("createFpNpcCollisionSource", () => {
  it("blocks player movement against a living babushka capsule", () => {
    const npcCollision = createFpNpcCollisionSource();
    npcCollision.syncNpcRow({
      npcId: 1n,
      archetype: "babushka",
      x: 1.0,
      y: 0.4,
      z: 0,
      state: 1,
      health: 100,
    });

    const index = buildCollisionSpatialIndex([]);
    const prev = new THREE.Vector3(0.2, 0.4, 0);
    const pos = new THREE.Vector3(1.3, 0.4, 0);
    const vel = new THREE.Vector3(1, 0, 0);
    const maxResolvedX = 1.0 - BABUSHKA_BODY_RADIUS_M - FP_PLAYER_COLLISION_RADIUS_M;

    resolvePlayerCollisions(pos, prev, vel, false, 0.82, index, {
      visitAabbsInXZ: (x0, x1, z0, z1, visit, queryPose) => {
        npcCollision.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
      },
    });

    expect(pos.x).toBeLessThanOrEqual(maxResolvedX + 1e-3);
    expect(vel.x).toBe(0);
  });

  it("ignores dead npc rows", () => {
    const npcCollision = createFpNpcCollisionSource();
    npcCollision.syncNpcRow({
      npcId: 2n,
      archetype: "babushka",
      x: 1,
      y: 0.4,
      z: 0,
      state: 2,
      health: 0,
    });

    const visited: CollisionAabb[] = [];
    npcCollision.visitCollisionAabbsInXZ(-4, 4, -4, 4, (aabb) => {
      visited.push(aabb);
    });
    expect(visited).toHaveLength(0);
  });
});

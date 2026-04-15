import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCollisionSpatialIndex } from "./collisionSpatialIndex.js";
import type { CollisionAabb } from "./collisionScene.js";
import { resolveFpCharacterCollisions } from "./fpCharacterController.js";

const _dir = dirname(fileURLToPath(import.meta.url));
const parityJson = readFileSync(
  join(_dir, "testFixtures/fpCharacterControllerParity.json"),
  "utf8",
) as string;

type ParityCase = {
  name: string;
  aabbs: CollisionAabb[];
  prevPos: [number, number, number];
  targetPos: [number, number, number];
  vel: [number, number, number];
  bodyHeight: number;
  radius: number;
  stepUpMargin: number;
  stepUpProbeM: number;
  grounded: boolean;
  expectPos: [number, number, number];
  expectVel: [number, number, number];
};

describe("fpCharacterController parity fixtures", () => {
  const data = JSON.parse(parityJson) as { cases: ParityCase[] };

  for (const c of data.cases) {
    it(c.name, () => {
      const index = buildCollisionSpatialIndex(c.aabbs);
      const pos = {
        x: c.targetPos[0],
        y: c.targetPos[1],
        z: c.targetPos[2],
      };
      const prevPos = {
        x: c.prevPos[0],
        y: c.prevPos[1],
        z: c.prevPos[2],
      };
      const vel = { x: c.vel[0], y: c.vel[1], z: c.vel[2] };
      resolveFpCharacterCollisions({
        pos,
        prevPos,
        vel,
        bodyHeight: c.bodyHeight,
        radius: c.radius,
        stepUpMargin: c.stepUpMargin,
        stepUpProbeM: c.stepUpProbeM,
        staticIndex: index,
        grounded: c.grounded,
      });
      expect(pos.x).toBeCloseTo(c.expectPos[0], 4);
      expect(pos.y).toBeCloseTo(c.expectPos[1], 4);
      expect(pos.z).toBeCloseTo(c.expectPos[2], 4);
      expect(vel.x).toBeCloseTo(c.expectVel[0], 4);
      expect(vel.y).toBeCloseTo(c.expectVel[1], 4);
      expect(vel.z).toBeCloseTo(c.expectVel[2], 4);
    });
  }
});

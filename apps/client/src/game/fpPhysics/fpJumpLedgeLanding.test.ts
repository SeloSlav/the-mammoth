import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createFpLocomotionState,
  FP_LOCOMOTION_FEET_SKIN_M,
  queueFpJump,
  stepFpLocomotion,
  type WalkGroundSampler,
} from "@the-mammoth/engine";

describe("jump landing on elevated platform", () => {
  it("snaps feet to a deck top while descending over the platform XZ footprint", () => {
    const floorY = 0.35;
    const deckTop = 1.36;
    const sampleWalk: WalkGroundSampler = (x, z, probeTopY, phase) => {
      if (phase === "skip") return Number.NaN;
      const feetY = probeTopY - 1.05;
      const slabs = [
        { x0: -4, x1: 4, z0: -4, z1: 4, top: floorY },
        { x0: 1.5, x1: 4, z0: -2, z1: 2, top: deckTop },
      ];
      let best = Number.NaN;
      for (const s of slabs) {
        if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
        const ok =
          phase === "descent"
            ? s.top <= probeTopY + 1e-3 && s.top >= feetY - 3.1
            : s.top <= feetY + 0.82;
        if (ok) best = Number.isFinite(best) ? Math.max(best, s.top) : s.top;
      }
      return best;
    };

    const state = createFpLocomotionState();
    const pos = new THREE.Vector3(2, floorY + FP_LOCOMOTION_FEET_SKIN_M, 0);
    state.grounded = true;
    queueFpJump(state);

    for (let frame = 0; frame < 120; frame++) {
      stepFpLocomotion(
        state,
        pos,
        0,
        {
          forward: false,
          backward: false,
          left: false,
          right: false,
          sprint: false,
          crouch: false,
          jumpHeld: false,
        },
        1 / 60,
        { sampleWalkGroundTopY: sampleWalk },
      );
      if (state.grounded && pos.y > floorY + 0.5) break;
    }

    expect(state.grounded).toBe(true);
    expect(pos.y).toBeCloseTo(deckTop + FP_LOCOMOTION_FEET_SKIN_M, 2);
  });
});

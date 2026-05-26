import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createFpLocomotionState,
  FP_LOCOMOTION_FEET_SKIN_M,
  queueFpJump,
  stepFpLocomotion,
  type WalkGroundSampler,
} from "./fpLocomotion.js";
import { resolveFpWalkProbePhase } from "./fpAirborneWalkPolicy.js";

function makeWalkSampler(slabs: { x0: number; x1: number; z0: number; z1: number; top: number }[]): WalkGroundSampler {
  return (x, z, probeTopY, phase) => {
    if (phase === "skip") return Number.NaN;
    const probeFeetY = probeTopY - 1.05;
    let best = Number.NaN;
    for (const s of slabs) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const reachable =
        phase === "descent"
          ? s.top <= probeTopY + 1e-3 && s.top >= probeFeetY - 3.1
          : s.top <= probeFeetY + 0.82;
      if (reachable) {
        best = Number.isFinite(best) ? Math.max(best, s.top) : s.top;
      }
    }
    return best;
  };
}

describe("stepFpLocomotion", () => {
  it("lands on an elevated block while descending", () => {
    const state = createFpLocomotionState();
    const pos = new THREE.Vector3(2, 0.384, 2);
    state.grounded = true;
    queueFpJump(state);

    const slabs = [
      { x0: 0, x1: 4, z0: 0, z1: 4, top: 0.35 },
      { x0: 0, x1: 4, z0: 0, z1: 4, top: 1.36 },
    ];

    for (let i = 0; i < 120; i++) {
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
        { sampleWalkGroundTopY: makeWalkSampler(slabs) },
      );
      if (state.grounded && pos.y > 1.3) break;
    }

    expect(state.grounded).toBe(true);
    expect(pos.y).toBeCloseTo(1.36 + FP_LOCOMOTION_FEET_SKIN_M, 2);
  });

  it("resolveFpWalkProbePhase skips probes while ascending", () => {
    expect(resolveFpWalkProbePhase(false, 3)).toBe("skip");
    expect(resolveFpWalkProbePhase(false, -0.5)).toBe("descent");
    expect(resolveFpWalkProbePhase(true, 0)).toBe("ground");
  });
});

describe("resolveFpWalkProbePhase", () => {
  it("classifies ascent, descent, and grounded probes", () => {
    expect(resolveFpWalkProbePhase(false, 3)).toBe("skip");
    expect(resolveFpWalkProbePhase(false, -0.5)).toBe("descent");
    expect(resolveFpWalkProbePhase(true, 0)).toBe("ground");
  });
});

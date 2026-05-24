import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createNpcVisualSmoothingState,
  ingestNpcAuthoritativeTransform,
  NPC_VISUAL_SMOOTHING_DEFAULTS,
  stepNpcVisualSmoothing,
} from "./NpcVisualSmoothingState.js";

describe("NpcVisualSmoothingState", () => {
  it("snaps visual pose on first authoritative ingest", () => {
    const state = createNpcVisualSmoothingState();
    ingestNpcAuthoritativeTransform(state, { x: 3, y: 0, z: -2 }, Math.PI / 4);

    expect(state.initialized).toBe(true);
    expect(state.visualPosition.toArray()).toEqual([3, 0, -2]);
    expect(state.networkPosition.toArray()).toEqual([3, 0, -2]);
  });

  it("eases visual position toward network updates instead of snapping", () => {
    const state = createNpcVisualSmoothingState();
    ingestNpcAuthoritativeTransform(state, { x: 0, y: 0, z: 0 }, 0);
    ingestNpcAuthoritativeTransform(state, { x: 0.4, y: 0, z: 0 }, 0);

    stepNpcVisualSmoothing(state, 1 / 60);
    expect(state.visualPosition.x).toBeGreaterThan(0);
    expect(state.visualPosition.x).toBeLessThan(0.4);

    for (let i = 0; i < 30; i++) {
      stepNpcVisualSmoothing(state, 1 / 60);
    }
    expect(state.visualPosition.x).toBeGreaterThan(0.35);
  });

  it("teleport-snaps when error exceeds threshold", () => {
    const state = createNpcVisualSmoothingState();
    ingestNpcAuthoritativeTransform(state, { x: 0, y: 0, z: 0 }, 0);
    ingestNpcAuthoritativeTransform(state, { x: 50, y: 0, z: 0 }, 0);

    stepNpcVisualSmoothing(state, 1 / 60, {
      ...NPC_VISUAL_SMOOTHING_DEFAULTS,
      teleportSnapDistance: 8,
    });

    expect(state.visualPosition.x).toBe(50);
  });

  it("derives locomotion animation from smoothed horizontal speed", () => {
    const state = createNpcVisualSmoothingState();
    ingestNpcAuthoritativeTransform(state, { x: 0, y: 0, z: 0 }, 0);

    for (let i = 0; i < 120; i++) {
      ingestNpcAuthoritativeTransform(state, { x: i * 0.08, y: 0, z: 0 }, 0);
      stepNpcVisualSmoothing(state, 1 / 60, {
        ...NPC_VISUAL_SMOOTHING_DEFAULTS,
        idleSpeedThreshold: 0.05,
        runSpeedThreshold: 2.5,
      });
    }

    expect(state.animationState).toBe("run");
  });

  it("smooths rotation with quaternion slerp", () => {
    const state = createNpcVisualSmoothingState();
    ingestNpcAuthoritativeTransform(state, { x: 0, y: 0, z: 0 }, 0);
    ingestNpcAuthoritativeTransform(state, { x: 0, y: 0, z: 0 }, Math.PI / 2);

    stepNpcVisualSmoothing(state, 1 / 60);
    const yaw = new THREE.Euler().setFromQuaternion(state.smoothedRotation, "YXZ").y;
    expect(yaw).toBeGreaterThan(0);
    expect(yaw).toBeLessThan(Math.PI / 2);
  });
});

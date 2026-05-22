import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { enterFpSit, isFpSitActive } from "./fpSitSession.js";
import { tryExitFpSitOnMovement } from "./fpSitExit.js";

describe("tryExitFpSitOnMovement", () => {
  it("restores exit feet and clears sit on Space", () => {
    enterFpSit({
      active: true,
      sittableKey: "chair",
      unitKey: "u1",
      modelRelPath: "static/models/objects/chair.glb",
      mode: "sit",
      anchorFeet: { x: 5, y: 1, z: 5 },
      exitFeet: { x: 4, y: 1, z: 4.5 },
      bodyYawRad: 0.25,
      eyeHeightM: 1.05,
    });
    const pos = new THREE.Vector3(5, 1, 5);
    const mainRaf = { bodyYaw: 0, headLookYaw: 0, pitch: 0 };
    const keys = new Set<string>(["Space"]);

    expect(tryExitFpSitOnMovement({ keys, mainRaf, pos })).toBe(true);
    expect(isFpSitActive()).toBe(false);
    expect(pos.x).toBe(4);
    expect(pos.y).toBe(1);
    expect(pos.z).toBe(4.5);
  });
});

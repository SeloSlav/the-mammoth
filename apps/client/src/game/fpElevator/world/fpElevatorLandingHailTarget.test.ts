import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  CALL_RADIUS_XZ,
  DOOR_W,
  LANDING_HAIL_PANEL_PAD_RADIUS_XZ_M,
} from "../fpElevatorConstants.js";
import { resolveLandingHailLevel } from "@the-mammoth/world";

describe("landing hail panel vs corridor door geometry", () => {
  const shaft = {
    doorFace: "e" as const,
    plateLocalY: 0,
    sy: 3.16,
    sx: 2.38,
    sz: 4,
  };

  it("keeps a typical hail-stand position inside server near_call_pose", () => {
    const plateWorldX = 100;
    const plateWorldZ = 200;
    const doorSideOffset = DOOR_W * 0.5 + 0.32;
    const outerHx = shaft.sx * 0.5;
    const hailStandX = plateWorldX + outerHx + 0.14;
    const hailStandZ = plateWorldZ - doorSideOffset;
    const feetY = 62;

    const level = resolveLandingHailLevel(hailStandX, feetY + 1.1, hailStandZ, {
      buildingWorldOriginY: 2,
      floorSpacingM: 3.2,
      maxLevel: 20,
      plateWorldX,
      plateWorldZ,
      shaft,
      callRadiusXZ: CALL_RADIUS_XZ,
      callYHalfWindow: 2.2,
    });
    expect(level).not.toBeNull();
  });

  it("keeps a corridor-door stand position outside the tight hail pad", () => {
    const panelX = 10;
    const panelZ = -0.77;
    const doorStandX = 10.9;
    const doorStandZ = 0;
    const dist = Math.hypot(doorStandX - panelX, doorStandZ - panelZ);
    expect(dist).toBeGreaterThan(LANDING_HAIL_PANEL_PAD_RADIUS_XZ_M);
  });

  it("detects crosshair aim toward the hail panel with a relaxed cone", () => {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 50);
    camera.position.set(0, 1.6, 0.2);
    camera.lookAt(0.55, 1.45, -0.75);
    camera.updateMatrixWorld(true);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const toPanel = new THREE.Vector3(0.55, 1.45, -0.75).sub(camera.position).normalize();
    expect(forward.dot(toPanel)).toBeGreaterThan(0.38);
  });
});

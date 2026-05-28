import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  crosshairHitsLandingHailPanelDisk,
  landingHailPanelOutwardNormal,
  LANDING_HAIL_PANEL_PICK_DISK_RADIUS_M,
} from "./fpElevatorLandingHailPanelPick.js";

describe("crosshairHitsLandingHailPanelDisk", () => {
  const scratch = {
    plane: new THREE.Plane(),
    hit: new THREE.Vector3(),
  };
  const screenCenterNdc = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();

  it("hits when crosshair is on the panel face from an oblique right-side view", () => {
    const plateWorldX = 100;
    const plateWorldZ = 200;
    const outerHx = 2.38 * 0.5;
    const doorSideOffset = 1.86 * 0.5 + 0.32;
    const iconOff = 0.065 + 0.0325 + 0.0015;
    const center = new THREE.Vector3(
      plateWorldX + outerHx - 0.025 + iconOff,
      62 + 1.34,
      plateWorldZ - doorSideOffset,
    );
    const outward = landingHailPanelOutwardNormal("e");
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 200);
    // Corridor side (+X), offset to the player's right (+Z), looking at the PR button.
    camera.position.set(plateWorldX + outerHx + 0.14, 62 + 1.1, plateWorldZ - doorSideOffset + 0.55);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);

    expect(
      crosshairHitsLandingHailPanelDisk(
        raycaster,
        screenCenterNdc,
        camera,
        center,
        outward,
        LANDING_HAIL_PANEL_PICK_DISK_RADIUS_M,
        scratch,
      ),
    ).toBe(true);
  });

  it("misses when crosshair is beside the panel disk", () => {
    const center = new THREE.Vector3(100.14, 62.5, 197.68);
    const outward = landingHailPanelOutwardNormal("e");
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 200);
    camera.position.set(100.05, 63.1, 198.35);
    camera.lookAt(center.x, center.y, center.z + 0.9);
    camera.updateMatrixWorld(true);

    expect(
      crosshairHitsLandingHailPanelDisk(
        raycaster,
        screenCenterNdc,
        camera,
        center,
        outward,
        LANDING_HAIL_PANEL_PICK_DISK_RADIUS_M,
        scratch,
      ),
    ).toBe(false);
  });

  it("misses when camera is on the shaft-side of the panel", () => {
    const center = new THREE.Vector3(101.26, 63.34, 198.75);
    const outward = landingHailPanelOutwardNormal("e");
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 200);
    camera.position.set(100.5, 63.1, 198.75);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);

    expect(
      crosshairHitsLandingHailPanelDisk(
        raycaster,
        screenCenterNdc,
        camera,
        center,
        outward,
        LANDING_HAIL_PANEL_PICK_DISK_RADIUS_M,
        scratch,
      ),
    ).toBe(false);
  });
});

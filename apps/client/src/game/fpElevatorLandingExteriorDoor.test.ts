import { Vector3 } from "three";
import type { ElevatorShaftLayout } from "@the-mammoth/world";
import { describe, expect, it } from "vitest";
import {
  advanceExteriorDoorVisSwingTowardAuth,
  fpElevLandingExteriorDoorAimTargetWorld,
  fpElevApplyClosedCabDoorOutsideClamp,
  fpElevApplyClosedExteriorDoorCollisionClamp,
  fpElevApplyLandingHoistwayFrontWallClamp,
  fpElevLandingExteriorDoorCollisionPlateLocal,
  EXTERIOR_DOOR_ANIM_SPEED,
  EXTERIOR_INTERACT_L0,
  EXTERIOR_INTERACT_L1,
  fpElevLandingExteriorDoorInteractPlateLocal,
  fpElevLandingExteriorDoorNearWorldPose,
} from "./fpElevatorLandingExteriorDoor.js";

const shaftLayout: ElevatorShaftLayout = {
  planKey: "shaft",
  plateX: 0,
  plateZ: 0,
  plateLocalY: 0,
  sx: 2.38,
  sy: 3.1578947368421053,
  sz: 4,
  doorFace: "e",
};

describe("fpElevLandingExteriorDoorInteractPlateLocal", () => {
  const hx = 1.09;
  const hz = 1.86;
  const fy = 10;

  it("accepts east-face pose at sill mid-depth", () => {
    const lx = hx + (EXTERIOR_INTERACT_L0 + EXTERIOR_INTERACT_L1) * 0.5;
    const ok = fpElevLandingExteriorDoorInteractPlateLocal("e", hx, hz, lx, 0, fy + 1.0, fy);
    expect(ok).toBe(true);
  });

  it("rejects east when too far along Z", () => {
    const lx = hx + (EXTERIOR_INTERACT_L0 + EXTERIOR_INTERACT_L1) * 0.5;
    const ok = fpElevLandingExteriorDoorInteractPlateLocal("e", hx, hz, lx, 2.0, fy + 1.0, fy);
    expect(ok).toBe(false);
  });

  it("accepts west-face mirrored strip", () => {
    const lx = -hx - (EXTERIOR_INTERACT_L0 + EXTERIOR_INTERACT_L1) * 0.5;
    const ok = fpElevLandingExteriorDoorInteractPlateLocal("w", hx, hz, lx, 0, fy + 1.0, fy);
    expect(ok).toBe(true);
  });

  it("blocks the full landing frontage, not just the leaf width", () => {
    const lx = hx + 0.12;
    const lz = hz - 0.06;
    const ok = fpElevLandingExteriorDoorCollisionPlateLocal("e", hx, hz, lx, lz, fy + 1.0, fy);
    expect(ok).toBe(true);
  });

  it("accepts a broad near-door world-space pose", () => {
    const ok = fpElevLandingExteriorDoorNearWorldPose(
      "e",
      100,
      200,
      hx,
      hz,
      100 + hx + 0.55,
      fy + 1.0,
      200 + 0.2,
      fy,
    );
    expect(ok).toBe(true);
  });

  it("accepts a broad near-door pose from the inside side too", () => {
    const ok = fpElevLandingExteriorDoorNearWorldPose(
      "e",
      100,
      200,
      hx,
      hz,
      100 + hx - 0.32,
      fy + 1.0,
      200,
      fy,
    );
    expect(ok).toBe(true);
  });

  it("returns a sensible world aim target on the door face", () => {
    const target = fpElevLandingExteriorDoorAimTargetWorld("e", 100, 200, hx, hz, fy);
    expect(target.x).toBeCloseTo(100 + hx, 5);
    expect(target.y).toBeCloseTo(fy + 1.1, 5);
    expect(target.z).toBeCloseTo(200, 5);
  });
});

describe("advanceExteriorDoorVisSwingTowardAuth", () => {
  it("caps step rate to match authoritative animation speed", () => {
    const next = advanceExteriorDoorVisSwingTowardAuth({
      current: 0,
      authoritative: 1,
      dtSec: 0.05,
      animSpeedPerSec: EXTERIOR_DOOR_ANIM_SPEED,
    });
    expect(next).toBeCloseTo(0.1025, 5);
  });

  it("snaps when within one step of the target", () => {
    const next = advanceExteriorDoorVisSwingTowardAuth({
      current: 0.99,
      authoritative: 1,
      dtSec: 0.05,
      animSpeedPerSec: EXTERIOR_DOOR_ANIM_SPEED,
    });
    expect(next).toBe(1);
  });
});

describe("closed elevator frontage clamps", () => {
  it("pushes the player back when slipping along the side of a closed landing face", () => {
    const pos = { x: 1.18, y: 11, z: 1.75 };
    const vel = new Vector3(1, 0, 0);
    fpElevApplyClosedExteriorDoorCollisionClamp(pos, vel, {
      ox: 0,
      oz: 0,
      landingRows: [{ shaftKey: "shaft", level: 1, swingOpen01: 0 }],
      layoutByKey: new Map([["shaft", shaftLayout]]),
      carByShaft: new Map([["shaft", { plateX: 0, plateZ: 0 }]]),
      feetYForLayout: () => 10,
    });
    expect(pos.x).toBeLessThan(1.18);
    expect(vel.x).toBe(0);
  });

  it("does not apply the exterior slab clamp while the door is mid-swing", () => {
    const pos = { x: 1.18, y: 11, z: 1.75 };
    const vel = new Vector3(1, 0, 0);
    fpElevApplyClosedExteriorDoorCollisionClamp(pos, vel, {
      ox: 0,
      oz: 0,
      landingRows: [{ shaftKey: "shaft", level: 1, swingOpen01: 0.4 }],
      layoutByKey: new Map([["shaft", shaftLayout]]),
      carByShaft: new Map([["shaft", { plateX: 0, plateZ: 0 }]]),
      feetYForLayout: () => 10,
    });
    expect(pos.x).toBe(1.18);
    expect(vel.x).toBe(1);
  });

  it("pushes the player out of a closed cab even near the side wall", () => {
    const pos = { x: 1.18, y: 11, z: 1.72 };
    const vel = new Vector3(-1, 0, 0);
    fpElevApplyClosedCabDoorOutsideClamp(pos, vel, {
      ox: 0,
      oz: 0,
      cars: [{ shaftKey: "shaft", doorOpen01: 0, cabFloorY: 10, plateX: 0, plateZ: 0 }],
      layoutByKey: new Map([["shaft", shaftLayout]]),
    });
    expect(pos.x).toBeGreaterThan(1.18);
    expect(vel.x).toBe(0);
  });

  it("blocks the solid front wall segment outside the door lane", () => {
    const pos = { x: 1.24, y: 11, z: 1.6 };
    const vel = new Vector3(-1, 0, 0);
    fpElevApplyLandingHoistwayFrontWallClamp(pos, vel, {
      ox: 0,
      oz: 0,
      landingRows: [{ shaftKey: "shaft", level: 1, swingOpen01: 0 }],
      carsByShaft: new Map([
        [
          "shaft",
          { currentLevel: 1, doorOpen01: 0, cabFloorY: 10, plateX: 0, plateZ: 0 },
        ],
      ]),
      layoutByKey: new Map([["shaft", shaftLayout]]),
      feetYForLayout: () => 10,
    });
    expect(pos.x).toBeGreaterThan(1.24);
    expect(vel.x).toBe(0);
  });

  it("allows the doorway lane only when both landing and cab doors are open", () => {
    const pos = { x: 1.24, y: 11, z: 0 };
    const vel = new Vector3(-1, 0, 0);
    fpElevApplyLandingHoistwayFrontWallClamp(pos, vel, {
      ox: 0,
      oz: 0,
      landingRows: [{ shaftKey: "shaft", level: 1, swingOpen01: 1 }],
      carsByShaft: new Map([
        [
          "shaft",
          { currentLevel: 1, doorOpen01: 1, cabFloorY: 10, plateX: 0, plateZ: 0 },
        ],
      ]),
      layoutByKey: new Map([["shaft", shaftLayout]]),
      feetYForLayout: () => 10,
    });
    expect(pos.x).toBe(1.24);
    expect(vel.x).toBe(-1);
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "@the-mammoth/world";
import {
  fpElevFeetInHoistwayColumnForFloorStack,
  fpElevatorClampWorldXZToCabIfRider,
  fpElevatorInDoorOutwardPadShellOnly,
  fpElevatorPlateLocalClampBounds,
  fpElevatorPlateLocalInCabPhysicsVolume,
} from "./fpElevatorVolumes.js";

describe("fpElevFeetInHoistwayColumnForFloorStack", () => {
  const base = {
    buildingWorldOriginX: 0,
    buildingWorldOriginY: 0,
    buildingWorldOriginZ: 0,
    floorSpacingM: 3.2,
    maxLevel: 19,
    layout: { plateX: -3.175, plateZ: -92, sx: 2.38, sz: 4.0 } as const,
  };

  it("is true at hoistway center on a mid-building feet Y", () => {
    expect(fpElevFeetInHoistwayColumnForFloorStack(-3.175, 18, -92, base)).toBe(true);
  });

  it("is false outside hoistway XZ (e.g. typical hail pad east of an east-door car)", () => {
    expect(fpElevFeetInHoistwayColumnForFloorStack(-3.175 + 2.2, 18, -92, base)).toBe(false);
  });

  it("is false far above the building band", () => {
    expect(fpElevFeetInHoistwayColumnForFloorStack(-3.175, 900, -92, base)).toBe(false);
  });

  it("respects building world origin offset", () => {
    expect(
      fpElevFeetInHoistwayColumnForFloorStack(10 - 3.175, 5, 20 - 92, {
        ...base,
        buildingWorldOriginX: 10,
        buildingWorldOriginY: 1,
        buildingWorldOriginZ: 20,
      }),
    ).toBe(true);
  });
});

describe("fpElevatorPlateLocalInCabPhysicsVolume", () => {
  it("does not treat feet one storey above the cab as inside the rider snap volume", () => {
    const innerH = Math.max(1.8, DEFAULT_BUILDING_FLOOR_SPACING_M - 2 * 0.11 - 0.14);
    const inner = { halfX: 1.05, halfZ: 1.86, innerH };
    const cabFeetY = 0.22;
    const py = cabFeetY + DEFAULT_BUILDING_FLOOR_SPACING_M * 0.99;
    expect(
      fpElevatorPlateLocalInCabPhysicsVolume(0, 0, py, cabFeetY, "e", 1, inner),
    ).toBe(false);
  });
});

describe("fpElevatorClampWorldXZToCabIfRider", () => {
  const inner = { halfX: 2, halfZ: 2, innerH: 2.5 };
  const cabFeetY = 10;
  const py = cabFeetY + 0.4;

  it("pulls the player back so the walk foot circle stays inside merge XZ (E face, doors closed)", () => {
    const cx = 100;
    const cz = 200;
    const wx = cx + inner.halfX * 0.96;
    const wz = cz;
    const r = fpElevatorClampWorldXZToCabIfRider(wx, wz, py, cabFeetY, cx, cz, "e", 0, inner);
    expect(r.didClamp).toBe(true);
    const lxSpan = inner.halfX - 0.24;
    expect(r.x).toBeCloseTo(cx + lxSpan, 5);
    expect(r.z).toBeCloseTo(wz, 5);
  });

  it("clamps Z when too far toward a side wall (E door: sides are ±Z)", () => {
    const cx = 0;
    const cz = 0;
    const wx = cx;
    const wz = cz + inner.halfZ * 0.969;
    const r = fpElevatorClampWorldXZToCabIfRider(wx, wz, py, cabFeetY, cx, cz, "e", 0, inner);
    expect(r.didClamp).toBe(true);
    expect(r.z).toBeCloseTo(cz + (inner.halfZ - 0.24), 5);
  });

  it("no-ops when feet are outside the rider envelope", () => {
    const cx = 0;
    const cz = 0;
    const wx = cx + inner.halfX * 2;
    const wz = cz;
    const r = fpElevatorClampWorldXZToCabIfRider(wx, wz, py, cabFeetY, cx, cz, "e", 0, inner);
    expect(r.didClamp).toBe(false);
    expect(r.x).toBe(wx);
  });

  it("does not clamp on the door-outward pad shell when the door is open (player can walk off)", () => {
    const cx = 100;
    const cz = 200;
    const b = fpElevatorPlateLocalClampBounds("e", 1, inner);
    const pad = 0.26;
    const lx = b.lxMax + 0.12;
    const lz = 0;
    expect(fpElevatorInDoorOutwardPadShellOnly(lx, lz, "e", b, pad)).toBe(true);
    const wx = cx + lx;
    const wz = cz + lz;
    const r = fpElevatorClampWorldXZToCabIfRider(wx, wz, py, cabFeetY, cx, cz, "e", 1, inner);
    expect(r.didClamp).toBe(false);
    expect(r.x).toBeCloseTo(wx, 5);
  });

  it("still clamps that shell when the door is closed (no popping through the sill)", () => {
    const cx = 100;
    const cz = 200;
    const b = fpElevatorPlateLocalClampBounds("e", 0, inner);
    const pad = 0.26;
    const lx = b.lxMax + 0.12;
    expect(fpElevatorInDoorOutwardPadShellOnly(lx, 0, "e", b, pad)).toBe(true);
    const wx = cx + lx;
    const wz = cz;
    const r = fpElevatorClampWorldXZToCabIfRider(wx, wz, py, cabFeetY, cx, cz, "e", 0, inner);
    expect(r.didClamp).toBe(true);
    expect(r.x).toBeCloseTo(cx + b.lxMax, 5);
  });

  it("still clamps diagonal pad corners (not door-only outward)", () => {
    const cx = 0;
    const cz = 0;
    const b = fpElevatorPlateLocalClampBounds("e", 1, inner);
    const pad = 0.26;
    const lx = b.lxMax + 0.1;
    const lz = b.lzMax + 0.1;
    expect(fpElevatorInDoorOutwardPadShellOnly(lx, lz, "e", b, pad)).toBe(false);
    const r = fpElevatorClampWorldXZToCabIfRider(
      cx + lx,
      cz + lz,
      py,
      cabFeetY,
      cx,
      cz,
      "e",
      1,
      inner,
    );
    expect(r.didClamp).toBe(true);
  });
});

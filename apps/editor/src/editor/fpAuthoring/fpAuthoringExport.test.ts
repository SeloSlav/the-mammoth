import { describe, expect, it } from "vitest";
import { mergeWeaponFpViewmodelForSave } from "./fpAuthoringExport.js";

describe("mergeWeaponFpViewmodelForSave", () => {
  it("preserves grip and visual scale when patch only updates hand", () => {
    const prev = {
      gripAnchorPositionM: { x: 0.02, y: 0.06, z: 0.03 },
      weaponVisualScale: { x: 0.28, y: 0.28, z: 0.28 },
      hand: {
        positionM: { x: 0, y: 0, z: 0 },
        eulerRad: { x: 1.5, y: 0, z: 3.14 },
        scale: { x: -0.17, y: 0.17, z: 0.17 },
      },
    };
    const patch = {
      hand: {
        positionM: { x: 0.01, y: 0, z: 0 },
        eulerRad: { x: 1.6, y: 0.1, z: 3.14 },
        scale: { x: -0.17, y: 0.17, z: 0.17 },
      },
    };
    const out = mergeWeaponFpViewmodelForSave(prev, patch) as Record<string, unknown>;
    expect(out.gripAnchorPositionM).toEqual(prev.gripAnchorPositionM);
    expect(out.weaponVisualScale).toEqual(prev.weaponVisualScale);
    expect(out.hand).toEqual(patch.hand);
  });

  it("returns prev when patch is null", () => {
    const prev = { a: 1 };
    expect(mergeWeaponFpViewmodelForSave(prev, null)).toBe(prev);
  });

  it("merges partial rigRoot with previous rigRoot", () => {
    const prev = {
      rigRoot: {
        positionM: { x: 0.3, y: -0.5, z: 0 },
        eulerRad: { x: 0, y: 0.1, z: 0 },
        scaleM: { x: 1, y: 1, z: 1 },
      },
    };
    const patch = { rigRoot: { positionM: { x: 0.4, y: -0.5, z: 0 } } };
    const out = mergeWeaponFpViewmodelForSave(prev, patch as Record<string, unknown>) as Record<
      string,
      unknown
    >;
    const rr = out.rigRoot as Record<string, unknown>;
    expect(rr.positionM).toEqual({ x: 0.4, y: -0.5, z: 0 });
    expect(rr.eulerRad).toEqual({ x: 0, y: 0.1, z: 0 });
    expect(rr.scaleM).toEqual({ x: 1, y: 1, z: 1 });
  });
});

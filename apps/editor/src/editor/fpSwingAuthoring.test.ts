import { describe, expect, it } from "vitest";
import { cloneMeleeSwingTrack, upsertSwingKeyframeAtT } from "./fpSwingAuthoring.js";
import type { PrimitiveSwingKeyframe } from "@the-mammoth/engine";

const base: PrimitiveSwingKeyframe[] = [
  { t: 0, translationM: { x: 0, y: 0, z: 0 }, rotationRad: { x: 0, y: 0, z: 0 } },
  { t: 1, translationM: { x: 0, y: 0, z: 0 }, rotationRad: { x: 0, y: 0, z: 0 } },
];

describe("fpSwingAuthoring", () => {
  it("upsert replaces near-t keyframe", () => {
    const out = upsertSwingKeyframeAtT(base, 0.01, {
      translationM: { x: 1, y: 0, z: 0 },
      rotationRad: { x: 0, y: 0, z: 0 },
    });
    expect(out.length).toBe(2);
    expect(out[0]!.t).toBe(0);
    expect(out[0]!.translationM.x).toBe(1);
  });

  it("upsert inserts middle keyframe and sorts", () => {
    const out = upsertSwingKeyframeAtT(base, 0.5, {
      translationM: { x: 0, y: 2, z: 0 },
      rotationRad: { x: 0, y: 0, z: 0 },
    });
    expect(out.length).toBe(3);
    expect(out.map((k) => k.t)).toEqual([0, 0.5, 1]);
  });

  it("cloneMeleeSwingTrack deep-copies vec fields", () => {
    const c = cloneMeleeSwingTrack(base);
    c[0]!.translationM.x = 9;
    expect(base[0]!.translationM.x).toBe(0);
  });
});

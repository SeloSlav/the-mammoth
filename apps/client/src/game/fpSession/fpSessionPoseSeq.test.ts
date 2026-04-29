import { describe, expect, it } from "vitest";
import type { PlayerPose } from "../../module_bindings/types";
import { poseSeqAsBigint } from "./fpSessionPoseSeq";

describe("poseSeqAsBigint", () => {
  it("returns bigint unchanged", () => {
    expect(poseSeqAsBigint(5n as PlayerPose["seq"])).toBe(5n);
  });

  it("coerces number to bigint", () => {
    expect(poseSeqAsBigint(42 as unknown as PlayerPose["seq"])).toBe(42n);
  });
});

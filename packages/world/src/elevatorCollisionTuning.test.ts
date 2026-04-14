import { describe, expect, it } from "vitest";
import {
  EXTERIOR_DOOR_W_M,
  LANDING_FRONT_PASSAGE_HALF_W_M,
} from "./elevatorCollisionTuning.js";

describe("elevatorCollisionTuning", () => {
  it("derives passage half-width from exterior door width", () => {
    expect(LANDING_FRONT_PASSAGE_HALF_W_M).toBeCloseTo(EXTERIOR_DOOR_W_M * 0.5 + 0.04, 6);
  });
});

import { describe, expect, it } from "vitest";
import { pickRandomClipIndex } from "./babushkaNpcAudio.js";

describe("pickRandomClipIndex", () => {
  it("returns 0 for a single clip", () => {
    expect(pickRandomClipIndex(1, 0)).toBe(0);
  });

  it("never repeats the excluded index when multiple clips exist", () => {
    for (let exclude = 0; exclude < 4; exclude += 1) {
      for (let i = 0; i < 40; i += 1) {
        expect(pickRandomClipIndex(4, exclude)).not.toBe(exclude);
      }
    }
  });
});

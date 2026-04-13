import { describe, expect, it } from "vitest";
import {
  landingKatSignTextForStory,
  oppositeCardinalFace,
} from "./elevatorLandingKatSign.js";

describe("landingKatSignTextForStory", () => {
  it("returns null for ground and unknown legacy index", () => {
    expect(landingKatSignTextForStory(0)).toBeNull();
    expect(landingKatSignTextForStory(1)).toBeNull();
    expect(landingKatSignTextForStory(99)).toBeNull();
  });

  it("returns Croatian KAT labels for upper storeys", () => {
    expect(landingKatSignTextForStory(2)).toBe("2 KAT");
    expect(landingKatSignTextForStory(19)).toBe("19 KAT");
  });
});

describe("oppositeCardinalFace", () => {
  it("pairs east/west and north/south", () => {
    expect(oppositeCardinalFace("e")).toBe("w");
    expect(oppositeCardinalFace("w")).toBe("e");
    expect(oppositeCardinalFace("n")).toBe("s");
    expect(oppositeCardinalFace("s")).toBe("n");
  });
});

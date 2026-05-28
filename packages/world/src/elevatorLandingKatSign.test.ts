import { describe, expect, it } from "vitest";
import {
  landingKatSignText,
  landingKatSignTextForStory,
  oppositeCardinalFace,
  stairwellInteriorKatSignTangentCenter,
  stairwellInteriorKatSignViewerRightTangentSign,
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

describe("landingKatSignText", () => {
  it("prefers authored short labels for upper storeys", () => {
    expect(landingKatSignText(2, "1")).toBe("1 KAT");
    expect(landingKatSignText(20, "19")).toBe("19 KAT");
  });

  it("falls back to the raw story index when no short label exists", () => {
    expect(landingKatSignText(7)).toBe("7 KAT");
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

describe("stairwellInteriorKatSignViewerRightTangentSign", () => {
  it("matches stair door viewer-right convention", () => {
    expect(stairwellInteriorKatSignViewerRightTangentSign("e")).toBe(1);
    expect(stairwellInteriorKatSignViewerRightTangentSign("s")).toBe(1);
    expect(stairwellInteriorKatSignViewerRightTangentSign("w")).toBe(-1);
    expect(stairwellInteriorKatSignViewerRightTangentSign("n")).toBe(-1);
  });
});

describe("stairwellInteriorKatSignTangentCenter", () => {
  it("offsets to viewer-right of the door along the wall", () => {
    const sx = 4;
    const sz = 4;
    const doorHalfW = 0.45;
    const doorT = 0;
    const east = stairwellInteriorKatSignTangentCenter("e", doorT, doorHalfW, sx, sz);
    const west = stairwellInteriorKatSignTangentCenter("w", doorT, doorHalfW, sx, sz);
    expect(east).toBeGreaterThan(doorT);
    expect(west).toBeLessThan(doorT);
  });
});

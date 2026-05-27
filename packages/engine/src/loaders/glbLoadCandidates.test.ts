import { describe, expect, it } from "vitest";
import {
  expandMammothGlbLoadCandidates,
  mammothGlbLoadCandidates,
  normalizeMammothStaticModelUri,
} from "@the-mammoth/assets";

describe("mammothGlbLoadCandidates", () => {
  it("loads directly from static/models", () => {
    expect(mammothGlbLoadCandidates("/static/models/fp/hands/right.glb")).toEqual([
      "/static/models/fp/hands/right.glb",
    ]);
  });

  it("rewrites legacy models-opt paths to static/models", () => {
    expect(normalizeMammothStaticModelUri("/static/models-opt/weapons/pistol.glb")).toBe(
      "/static/models/weapons/pistol.glb",
    );
    expect(mammothGlbLoadCandidates("/static/models-opt/weapons/pistol.glb")).toEqual([
      "/static/models/weapons/pistol.glb",
    ]);
  });

  it("expands catalog-style lists without duplicating entries", () => {
    expect(
      expandMammothGlbLoadCandidates([
        "/static/models/weapons/pistol.glb",
        "/static/models/weapons/crowbar.glb",
      ]),
    ).toEqual(["/static/models/weapons/pistol.glb", "/static/models/weapons/crowbar.glb"]);
  });
});

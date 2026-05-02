import { describe, expect, it } from "vitest";
import {
  fpFirearmHitscanPelletCountForHeldItem,
  fpFirearmHitscanRangeMForHeldItem,
  fpFirearmShotVisualConfigForHeldItem,
  sampleFpFirearmShotVisual,
} from "@the-mammoth/engine";

describe("fp firearm shot visuals", () => {
  it("client hitscan ranges mirror server hitscan.rs", () => {
    expect(fpFirearmHitscanRangeMForHeldItem("pistol")).toBe(48);
    expect(fpFirearmHitscanRangeMForHeldItem("shotgun-coach")).toBe(22);
    expect(fpFirearmHitscanPelletCountForHeldItem("pistol")).toBe(1);
    expect(fpFirearmHitscanPelletCountForHeldItem("shotgun-coach")).toBe(8);
    expect(fpFirearmHitscanRangeMForHeldItem("crowbar")).toBeNull();
  });

  it("only configures recoil and flash for ranged weapons", () => {
    expect(fpFirearmShotVisualConfigForHeldItem("pistol")).not.toBeNull();
    expect(fpFirearmShotVisualConfigForHeldItem("shotgun-coach")).not.toBeNull();
    expect(fpFirearmShotVisualConfigForHeldItem("crowbar")).toBeNull();
  });

  it("kicks immediately, flashes briefly, then returns to rest", () => {
    const config = fpFirearmShotVisualConfigForHeldItem("pistol");
    expect(config).not.toBeNull();
    if (!config) return;

    const start = sampleFpFirearmShotVisual(config, 0);
    expect(start.translationM.z).toBeGreaterThan(0);
    expect(start.rotationRad.x).toBeGreaterThan(0);
    expect(start.flashAlpha).toBe(1);

    const afterFlash = sampleFpFirearmShotVisual(config, config.flashDurationS * 1.2);
    expect(afterFlash.translationM.z).toBeGreaterThan(0);
    expect(afterFlash.flashAlpha).toBe(0);

    const done = sampleFpFirearmShotVisual(config, config.durationS);
    expect(done.translationM).toEqual({ x: 0, y: 0, z: 0 });
    expect(done.rotationRad).toEqual({ x: 0, y: 0, z: 0 });
    expect(done.flashAlpha).toBe(0);
  });

  it("makes the shotgun feel heavier than the pistol", () => {
    const pistol = fpFirearmShotVisualConfigForHeldItem("pistol");
    const shotgun = fpFirearmShotVisualConfigForHeldItem("shotgun-coach");
    expect(pistol).not.toBeNull();
    expect(shotgun).not.toBeNull();
    if (!pistol || !shotgun) return;

    expect(shotgun.kickBackM).toBeGreaterThan(pistol.kickBackM);
    expect(shotgun.durationS).toBeGreaterThan(pistol.durationS);
    expect(shotgun.flashScaleM).toBeGreaterThan(pistol.flashScaleM);
  });
});

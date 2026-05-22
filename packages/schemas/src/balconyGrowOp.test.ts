import { describe, expect, it } from "vitest";
import {
  BALCONY_GROW_BASELINE_DURATION_SECS,
  BALCONY_GROW_REFERENCE_DAYS,
  BALCONY_GROW_TRAY_BUILTIN_IDS,
  BALCONY_GROW_TRAY_MAX_WATER_L,
  BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK,
  BALCONY_GAME_DAY_SECS,
  BALCONY_WATER_PATCH_DURATION_SECS,
  balconyGrowCropSecondsAtBaseSpeed,
  balconyGrowDecorTrayId,
  balconyGrowSpeedModifier,
  balconyGrowStageFromProgress,
  balconyGrowSlotOffsetsFromHalfExtents,
  balconyGrowTraySecondsToDry,
  balconyGrowTrayStashKey,
  parseBalconyGrowDecorTrayId,
  parseBalconyGrowTrayStashKey,
} from "./balconyGrowOp.js";

describe("balconyGrowOp", () => {
  it("parses grow-tray stash keys", () => {
    const key = balconyGrowTrayStashKey("unit_a", BALCONY_GROW_TRAY_BUILTIN_IDS[0]!);
    expect(parseBalconyGrowTrayStashKey(key)).toEqual({
      unitKey: "unit_a",
      trayId: BALCONY_GROW_TRAY_BUILTIN_IDS[0],
    });
    expect(parseBalconyGrowTrayStashKey("unit_a#footlocker")).toBeNull();
  });

  it("builds decor-backed grow-tray ids", () => {
    const trayId = balconyGrowDecorTrayId(123n);
    expect(trayId).toBe("decor:123");
    expect(parseBalconyGrowDecorTrayId(trayId)).toBe(123n);
    expect(parseBalconyGrowDecorTrayId("decor:nope")).toBeNull();
  });

  it("stacks growth speed modifiers", () => {
    const m = balconyGrowSpeedModifier({
      lightsOn: true,
      fertilizerPresent: true,
      waterLiters: 1.0,
    });
    expect(m).toBeCloseTo(1.55, 2);
    expect(
      balconyGrowSpeedModifier({
        lightsOn: false,
        fertilizerPresent: false,
        waterLiters: 0,
      }),
    ).toBe(1);
  });

  it("caps water bonus at tray max", () => {
    const atMax = balconyGrowSpeedModifier({
      lightsOn: false,
      fertilizerPresent: false,
      waterLiters: BALCONY_GROW_TRAY_MAX_WATER_L + 5,
    });
    const atTwoHalf = balconyGrowSpeedModifier({
      lightsOn: false,
      fertilizerPresent: false,
      waterLiters: 1.0,
    });
    expect(atMax).toBeCloseTo(1.4, 2);
    expect(atTwoHalf).toBeCloseTo(1.2, 2);
  });

  it("maps progress to stage labels", () => {
    expect(balconyGrowStageFromProgress(0)).toBe("seed");
    expect(balconyGrowStageFromProgress(0.01)).toBe("sapling");
    expect(balconyGrowStageFromProgress(0.25)).toBe("sapling");
    expect(balconyGrowStageFromProgress(0.7)).toBe("mid");
    expect(balconyGrowStageFromProgress(1)).toBe("mature");
  });

  it("uses a 15-minute session baseline for a 5-day reference crop", () => {
    expect(BALCONY_GROW_BASELINE_DURATION_SECS).toBe(900);
    expect(BALCONY_GROW_REFERENCE_DAYS).toBe(5);
    expect(BALCONY_GAME_DAY_SECS).toBe(180);
    expect(balconyGrowCropSecondsAtBaseSpeed(5)).toBe(900);
    expect(balconyGrowCropSecondsAtBaseSpeed(2)).toBe(360);
    expect(balconyGrowCropSecondsAtBaseSpeed(9)).toBe(1620);
  });

  it("tunes water pacing for session-based balcony play", () => {
    expect(BALCONY_WATER_PATCH_DURATION_SECS).toBe(45);
    expect(BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK).toBe(0.042);
    expect(balconyGrowTraySecondsToDry()).toBeGreaterThan(230);
    expect(balconyGrowTraySecondsToDry()).toBeLessThan(245);
  });

  it("spreads slot centers toward tray edges", () => {
    const slots = balconyGrowSlotOffsetsFromHalfExtents(0.4, 0.3);
    expect(slots[0]!.x).toBeCloseTo(-0.312, 3);
    expect(slots[0]!.z).toBeCloseTo(-0.234, 3);
    expect(slots[3]!.x).toBeCloseTo(0.312, 3);
    expect(slots[3]!.z).toBeCloseTo(0.234, 3);
  });
});

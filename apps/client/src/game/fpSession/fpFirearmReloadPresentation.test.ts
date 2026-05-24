import { describe, expect, it, beforeEach } from "vitest";
import {
  resetFpFirearmReloadPresentationSnapshot,
  snapshotFpFirearmReloadPresentation,
} from "./fpFirearmReloadPresentation.js";
import type { LocalFirearmChamberView } from "../fpHotbar/fpFirearmChamber.js";

describe("snapshotFpFirearmReloadPresentation", () => {
  beforeEach(() => {
    resetFpFirearmReloadPresentationSnapshot();
  });

  it("returns undefined when not reloading", () => {
    const view: LocalFirearmChamberView = {
      chamberCount: 2,
      capacity: 6,
      reserveCount: 10,
      isReloading: false,
      reloadRemainingMs: 0,
      weaponSynced: true,
    };
    expect(snapshotFpFirearmReloadPresentation("pistol", view)).toBeUndefined();
  });

  it("locks round count at reload start", () => {
    const view: LocalFirearmChamberView = {
      chamberCount: 1,
      capacity: 6,
      reserveCount: 20,
      isReloading: true,
      reloadRemainingMs: 1500,
      weaponSynced: true,
    };
    const first = snapshotFpFirearmReloadPresentation("pistol", view);
    expect(first?.roundsToLoad).toBe(5);
    view.chamberCount = 6;
    const second = snapshotFpFirearmReloadPresentation("pistol", view);
    expect(second?.roundsToLoad).toBe(5);
  });

  it("uses scaled duration for partial reload progress", () => {
    const view: LocalFirearmChamberView = {
      chamberCount: 5,
      capacity: 6,
      reserveCount: 20,
      isReloading: true,
      reloadRemainingMs: 150,
      weaponSynced: true,
    };
    const snap = snapshotFpFirearmReloadPresentation("pistol", view);
    expect(snap?.roundsToLoad).toBe(1);
    // 1 round of 6 @ 2000ms full => ~333ms; 150ms left => ~55% through
    expect(snap!.progress01).toBeGreaterThan(0.5);
    expect(snap!.progress01).toBeLessThan(0.6);
  });
});

import type { LocalFirearmChamberView } from "../fpHotbar/fpFirearmChamber.js";
import { scaledReloadDurationMsForPartial } from "../fpHotbar/fpFirearmChamber.js";

export type FpFirearmReloadPresentation = {
  progress01: number;
  roundsToLoad: number;
};

let activeSnapshot: {
  weaponDefId: string;
  roundsToLoad: number;
  durationMs: number;
} | null = null;

/** Resets cached reload-round count (tests / weapon swap). */
export function resetFpFirearmReloadPresentationSnapshot(): void {
  activeSnapshot = null;
}

/**
 * Derives reload animation inputs from the chamber HUD snapshot.
 * Duration scales with rounds loaded (full mag time × rounds / capacity).
 */
export function snapshotFpFirearmReloadPresentation(
  weaponDefId: string,
  view: LocalFirearmChamberView,
): FpFirearmReloadPresentation | undefined {
  if (!view.isReloading) {
    activeSnapshot = null;
    return undefined;
  }

  if (!activeSnapshot || activeSnapshot.weaponDefId !== weaponDefId) {
    const needed = Math.max(0, view.capacity - view.chamberCount);
    const roundsToLoad = Math.max(1, Math.min(needed, view.reserveCount));
    const durationMs = scaledReloadDurationMsForPartial(
      weaponDefId,
      roundsToLoad,
      view.capacity,
    );
    if (durationMs <= 0) {
      activeSnapshot = null;
      return undefined;
    }
    activeSnapshot = { weaponDefId, durationMs, roundsToLoad };
  }

  const progress01 = Math.max(
    0,
    Math.min(1, 1 - view.reloadRemainingMs / activeSnapshot.durationMs),
  );
  return {
    progress01,
    roundsToLoad: activeSnapshot.roundsToLoad,
  };
}

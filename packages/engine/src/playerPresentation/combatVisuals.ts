import type { HeldItemId } from "@the-mammoth/game";

/** Presentation-only combat feedback (VFX, viewmodel, camera punch). */
export type MeleeCombatVisualEvent = {
  seq: number;
  weaponId: HeldItemId;
};

export type MeleeCombatVisualSink = (evt: MeleeCombatVisualEvent) => void;

/**
 * Future: hook raycasts / predicted hits from gameplay sim without importing SpaceTimeDB here.
 * For now apps can subscribe to log or spawn decals.
 */
export type HitTracePlaceholder = {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  maxDistance: number;
};

/**
 * One-shots for slot drag in {@link MammothDraggableItem} (inventory / hotbar / stash).
 *
 * Assets: `apps/client/public/audio/ui/inventory-item-pick.wav`,
 * `apps/client/public/audio/ui/inventory-item-drop.wav`.
 */

import { playUiWavOneShot } from "../game/audio/uiWavOneShot.js";

const DEFAULT_VOLUME = 0.9;

/** Fires when pointer movement crosses the drag threshold (item leaves the slot). */
export function playInventoryItemDragPickSound(): void {
  playUiWavOneShot("inventory-item-pick.wav", DEFAULT_VOLUME);
}

/** Fires when the drag ends (slot target, cancel, or world-drop). */
export function playInventoryItemDragDropSound(): void {
  playUiWavOneShot("inventory-item-drop.wav", DEFAULT_VOLUME);
}

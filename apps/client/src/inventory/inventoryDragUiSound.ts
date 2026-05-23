/**
 * Inventory / stash slot UI one-shots.
 *
 * - Pick: drag threshold ({@link MammothDraggableItem}) and click-withdraw from stash.
 * - Drop: successful drag onto a slot ({@link evaluateInventoryDrop}) and click-deposit into stash.
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

/** Fires when a drag ends on a valid drop target (handled by inventory HUD drop logic). */
export function playInventoryItemDragDropSound(): void {
  playUiWavOneShot("inventory-item-drop.wav", DEFAULT_VOLUME);
}

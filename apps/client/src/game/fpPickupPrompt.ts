/** FP world interact hint (pickup, elevator door, …) — written from `mountFpSession` tick, read by React HUD. */

import type { ApartmentDoorInteractPromptKind } from "@the-mammoth/world";

export type FpPickupPromptDroppedItem = {
  kind: "dropped_item";
  /** Stable key for React / equality (bigint string). */
  droppedItemIdStr: string;
  displayName: string;
};

export type FpPickupPromptElevatorExteriorDoor = {
  kind: "elevator_exterior_door";
  willClose: boolean;
  floorLabel: string;
};

export type FpPickupPromptApartmentDoor = {
  kind: "apartment_door";
  willClose: boolean;
  promptKind: ApartmentDoorInteractPromptKind;
};

export type FpPickupPromptState =
  | FpPickupPromptDroppedItem
  | FpPickupPromptElevatorExteriorDoor
  | FpPickupPromptApartmentDoor
  | null;

const listeners = new Set<() => void>();

let state: FpPickupPromptState = null;

export function getFpPickupPrompt(): FpPickupPromptState {
  return state;
}

function same(a: FpPickupPromptState, b: FpPickupPromptState): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "dropped_item" && b.kind === "dropped_item") {
    return a.droppedItemIdStr === b.droppedItemIdStr && a.displayName === b.displayName;
  }
  if (a.kind === "elevator_exterior_door" && b.kind === "elevator_exterior_door") {
    return a.willClose === b.willClose && a.floorLabel === b.floorLabel;
  }
  if (a.kind === "apartment_door" && b.kind === "apartment_door") {
    return a.willClose === b.willClose && a.promptKind === b.promptKind;
  }
  return false;
}

export function setFpPickupPrompt(next: FpPickupPromptState): void {
  if (same(state, next)) return;
  state = next;
  for (const l of listeners) l();
}

export function subscribeFpPickupPrompt(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** FP world interact hint — written from `mountFpSession` tick, read by React HUD. */

import type { ApartmentDoorInteractPromptKind } from "@the-mammoth/world";

export type FpPickupPromptDroppedItem = {
  kind: "dropped_item";
  droppedItemIdStr: string;
  displayName: string;
};

export type FpPickupPromptWorldLoot = {
  kind: "world_loot";
  lootIdStr: string;
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

export type FpPickupPromptApartmentClaim = {
  kind: "apartment_claim";
  unitKey: string;
  /** Matches server chat wording — floor + wing + unit index */
  displayLabel: string;
  claimProgressSecs: number;
  claimFullSecs: number;
};

export type FpPickupPromptApartmentReinforce = {
  kind: "apartment_reinforce";
  doorRowKey: string;
};

export type FpPickupPromptApartmentStash = {
  kind: "apartment_stash";
  unitKey: string;
};

export type FpPickupPromptState =
  | FpPickupPromptDroppedItem
  | FpPickupPromptWorldLoot
  | FpPickupPromptElevatorExteriorDoor
  | FpPickupPromptApartmentDoor
  | FpPickupPromptApartmentClaim
  | FpPickupPromptApartmentReinforce
  | FpPickupPromptApartmentStash
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
  if (a.kind === "world_loot" && b.kind === "world_loot") {
    return a.lootIdStr === b.lootIdStr && a.displayName === b.displayName;
  }
  if (a.kind === "elevator_exterior_door" && b.kind === "elevator_exterior_door") {
    return a.willClose === b.willClose && a.floorLabel === b.floorLabel;
  }
  if (a.kind === "apartment_door" && b.kind === "apartment_door") {
    return a.willClose === b.willClose && a.promptKind === b.promptKind;
  }
  if (a.kind === "apartment_claim" && b.kind === "apartment_claim") {
    if (a.unitKey !== b.unitKey || a.displayLabel !== b.displayLabel) return false;
    const ra = Math.max(0, a.claimFullSecs - a.claimProgressSecs);
    const rb = Math.max(0, b.claimFullSecs - b.claimProgressSecs);
    return Math.abs(ra - rb) < 0.08;
  }
  if (a.kind === "apartment_reinforce" && b.kind === "apartment_reinforce") {
    return a.doorRowKey === b.doorRowKey;
  }
  if (a.kind === "apartment_stash" && b.kind === "apartment_stash") {
    return a.unitKey === b.unitKey;
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

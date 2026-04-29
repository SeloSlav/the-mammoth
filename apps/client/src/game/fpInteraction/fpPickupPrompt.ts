/** FP world interact hint — written from `mountFpSession` tick, read by React HUD. */

import type { ApartmentDoorInteractPromptKind } from "@the-mammoth/world";

export type FpPickupPromptDroppedItem = {
  kind: "dropped_item";
  droppedItemIdStr: string;
  displayName: string;
  /** `dropped_item.world_spawn_slot` — world loot uses "collect" copy in HUD. */
  worldAnchorSpawn?: boolean;
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

export type FpPickupPromptApartmentClaimBlockedGear = {
  kind: "apartment_claim_blocked_gear";
  unitKey: string;
  displayLabel: string;
  missingDoorLock: boolean;
  missingScrewdriver: boolean;
};

export type FpPickupPromptApartmentClaimBlockedGuest = {
  kind: "apartment_claim_blocked_guest";
  unitKey: string;
  displayLabel: string;
};

export type FpPickupPromptApartmentStash = {
  kind: "apartment_stash";
  unitKey: string;
};

export type FpPickupPromptState =
  | FpPickupPromptDroppedItem
  | FpPickupPromptElevatorExteriorDoor
  | FpPickupPromptApartmentDoor
  | FpPickupPromptApartmentClaim
  | FpPickupPromptApartmentClaimBlockedGear
  | FpPickupPromptApartmentClaimBlockedGuest
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
    return (
      a.droppedItemIdStr === b.droppedItemIdStr &&
      a.displayName === b.displayName &&
      a.worldAnchorSpawn === b.worldAnchorSpawn
    );
  }
  if (a.kind === "elevator_exterior_door" && b.kind === "elevator_exterior_door") {
    return a.willClose === b.willClose && a.floorLabel === b.floorLabel;
  }
  if (a.kind === "apartment_door" && b.kind === "apartment_door") {
    return a.willClose === b.willClose && a.promptKind === b.promptKind;
  }
  if (a.kind === "apartment_claim" && b.kind === "apartment_claim") {
    if (a.unitKey !== b.unitKey || a.displayLabel !== b.displayLabel) return false;
    if (a.claimFullSecs !== b.claimFullSecs) return false;
    /** Wall-clock extrapolation updates every RAF — coarser epsilon made the fill bar chunky. */
    return Math.abs(a.claimProgressSecs - b.claimProgressSecs) < 1 / 960;
  }
  if (a.kind === "apartment_claim_blocked_gear" && b.kind === "apartment_claim_blocked_gear") {
    return (
      a.unitKey === b.unitKey &&
      a.displayLabel === b.displayLabel &&
      a.missingDoorLock === b.missingDoorLock &&
      a.missingScrewdriver === b.missingScrewdriver
    );
  }
  if (a.kind === "apartment_claim_blocked_guest" && b.kind === "apartment_claim_blocked_guest") {
    return a.unitKey === b.unitKey && a.displayLabel === b.displayLabel;
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

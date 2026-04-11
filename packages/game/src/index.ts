/** Gameplay rules live here (claims, doors, loot). Runtime wires reducers via @the-mammoth/net. */

export type ApartmentClaimIntent = {
  unitId: string;
};

export * from "./player/index.js";

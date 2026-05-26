/** Gameplay rules live here (claims, doors, loot). Runtime wires reducers via @the-mammoth/net. */

export type ApartmentClaimIntent = {
  unitId: string;
};

export * from "./apartmentInteriorAnchors.js";
export * from "./collision/index.js";
export * from "./player/index.js";
export * from "./npc/replicatedNpcSnapshot.js";
export * from "./npc/npcPerception.js";
export * from "./npc/npcPerceptionProfiles.js";
export * from "./npc/archetypes/babushka.js";

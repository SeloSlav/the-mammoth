import type { HeldItemId } from "@the-mammoth/game";
import type { WeaponPrimitivePresentationDoc } from "./weaponPrimitiveAuthoring.js";
import type { WeaponDefinition } from "./weaponTypes.js";
import {
  baseballBatWeaponDefinition,
  crowbarWeaponDefinition,
  knifeWeaponDefinition,
  pistolWeaponDefinition,
  srbosjekWeaponDefinition,
  screwdriverWeaponDefinition,
  shotgunCoachWeaponDefinition,
} from "./sampleDefinitions.js";

type WeaponRegistryMap = Record<Exclude<HeldItemId, "unarmed">, WeaponDefinition>;

const WEAPON_REGISTRY: WeaponRegistryMap = {
  crowbar: crowbarWeaponDefinition,
  knife: knifeWeaponDefinition,
  srbosjek: srbosjekWeaponDefinition,
  "baseball-bat": baseballBatWeaponDefinition,
  pistol: pistolWeaponDefinition,
  "shotgun-coach": shotgunCoachWeaponDefinition,
  screwdriver: screwdriverWeaponDefinition,
};

type RegistryKey = keyof typeof WEAPON_REGISTRY;

function isRegistryKey(id: string): id is RegistryKey {
  return id in WEAPON_REGISTRY;
}

/** Shipped weapon GLBs / definitions (preload + registry). */
export const ALL_WEAPON_DEFINITIONS: readonly WeaponDefinition[] = [
  crowbarWeaponDefinition,
  knifeWeaponDefinition,
  srbosjekWeaponDefinition,
  baseballBatWeaponDefinition,
  pistolWeaponDefinition,
  shotgunCoachWeaponDefinition,
  screwdriverWeaponDefinition,
];

/** Every {@link ALL_WEAPON_DEFINITIONS} id — editor save validation, middleware, hot-reload lists. */
export const WEAPON_DEFINITION_ID_SET: ReadonlySet<string> = new Set(
  ALL_WEAPON_DEFINITIONS.map((d) => d.id),
);

export function getWeaponDefinition(id: Exclude<HeldItemId, "unarmed">): WeaponDefinition | undefined {
  return WEAPON_REGISTRY[id];
}

/** Inventory / catalog `def_id` → {@link HeldItemId} when that id is a registered weapon preview mesh. */
export function equippedHeldItemIdFromDefId(defId: string): HeldItemId {
  if (isRegistryKey(defId)) return defId;
  return "unarmed";
}

/**
 * Maps gameplay equip id → definition for **active** weapon mesh + authoring.
 * `"unarmed"` and unknown ids → `undefined` (first person shows hands only).
 */
export function getWeaponDefinitionForEquippedPrimary(id: HeldItemId): WeaponDefinition | undefined {
  if (id === "unarmed") return undefined;
  return getWeaponDefinition(id);
}

/**
 * Replace mount + swing + FP viewmodel authoring for one weapon at runtime (dev hot-reload).
 * Mutates the shared definition object; callers should reload the matching FP layout.
 */
export function applyWeaponPrimitivePresentationDoc(
  weaponId: string,
  doc: WeaponPrimitivePresentationDoc,
): void {
  if (!isRegistryKey(weaponId)) {
    throw new Error(`applyWeaponPrimitivePresentationDoc: unknown weapon id "${weaponId}"`);
  }
  WEAPON_REGISTRY[weaponId].primitivePresentation = doc;
}

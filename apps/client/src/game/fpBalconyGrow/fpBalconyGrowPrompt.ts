import * as THREE from "three";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import {
  BALCONY_GROW_TRAY_BUILTIN_IDS,
  balconyGrowTrayStashKey,
  parseBalconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import { getMammothItemDef } from "../../inventory/mammothItemCatalog";
import { clientMayUseApartmentStash } from "../fpApartment/fpApartmentGameplay.js";
import { APARTMENT_STASH_KIND_GROW_TRAY } from "../fpApartment/fpApartmentStashKey.js";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";

export type BalconyGrowTrayPrompt =
  | {
      kind: "balcony_grow_harvest";
      unitKey: string;
      trayId: string;
      slotIndex: number;
      cropDisplayName: string;
    }
  | {
      kind: "balcony_grow_tray";
      unitKey: string;
      trayId: string;
      stashKey: string;
      stashLabel: string;
    };

const PHASE_MATURE = 2;

function growTrayStashPrompt(
  conn: DbConnection,
  identity: Identity,
  feet: { x: number; y: number; z: number },
  unitKey: string,
  trayId: string,
): BalconyGrowTrayPrompt | null {
  const stashKey = balconyGrowTrayStashKey(unitKey, trayId);
  if (!clientMayUseApartmentStash(conn, identity, stashKey, feet)) {
    return null;
  }
  return {
    kind: "balcony_grow_tray",
    unitKey,
    trayId,
    stashKey,
    stashLabel: "grow tray fertilizer",
  };
}

export function getBalconyGrowTrayPromptFromHit(
  conn: DbConnection,
  identity: Identity | undefined,
  feet: { x: number; y: number; z: number },
  hit: THREE.Intersection,
  growState: BalconyGrowOpUnitState,
): BalconyGrowTrayPrompt | null {
  if (!identity) return null;
  const unitKey = hit.object.userData.mammothGrowTrayUnitKey;
  const trayId = hit.object.userData.mammothGrowTrayId;
  const slotIndex = hit.object.userData.mammothGrowSlotIndex;
  if (typeof unitKey !== "string" || typeof trayId !== "string") return null;

  if (typeof slotIndex === "number") {
    const plant = growState.plants.find(
      (p) => p.trayId === trayId && p.slotIndex === slotIndex,
    );
    if (plant?.phase === PHASE_MATURE) {
      const cropName =
        getMammothItemDef(plant.cropDefId)?.displayName ?? plant.cropDefId;
      return {
        kind: "balcony_grow_harvest",
        unitKey,
        trayId,
        slotIndex,
        cropDisplayName: cropName,
      };
    }
    return growTrayStashPrompt(conn, identity, feet, unitKey, trayId);
  }

  return growTrayStashPrompt(conn, identity, feet, unitKey, trayId);
}

export function isKnownGrowTrayBuiltinId(trayId: string): boolean {
  return (BALCONY_GROW_TRAY_BUILTIN_IDS as readonly string[]).includes(trayId);
}

export { parseBalconyGrowTrayStashKey };

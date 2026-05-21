import * as THREE from "three";
import type { DbConnection } from "../../module_bindings";
import type { MountFpApartmentDecorMeshesResult } from "../fpApartment/fpApartmentDecorMeshes.js";
import {
  resolveBalconyGrowPlacement,
  syncBalconyGrowPlacementPreview,
  balconyGrowPlantPrimaryClickBlockedMessage,
  type BalconyGrowPlacementRaycast,
} from "./fpBalconyGrowPlacement.js";
import { type BalconyGrowTrayPrompt } from "./fpBalconyGrowPrompt.js";
import { createBalconyGrowSeedPreview } from "./fpBalconyGrowSeedPreview.js";
import { createBalconyWaterPatchVisuals } from "./fpBalconyGrowWaterPatches.js";
import { showGameplayErrorBar } from "../../ui/gameplayErrorBar.js";
import { setBalconyGrowInspectTarget } from "./fpBalconyGrowInspectState.js";
import { syncBalconyGrowInspect } from "./fpBalconyGrowInspectSync.js";
import { publishBalconyGrowInspectScreenAnchor, clearBalconyGrowInspectPresentation } from "./fpBalconyGrowInspectPresentation.js";
import { readBalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import { balconyGrowTrayStashKey } from "@the-mammoth/schemas";
import { APARTMENT_STASH_KIND_GROW_TRAY } from "../fpApartment/fpApartmentStashKey.js";
import { setFpActiveStashPanel } from "../fpInteraction/fpActiveStashPanel.js";
import { requestMammothInventoryOpenFromFp } from "../fpInteraction/fpInventoryOpenRequest.js";
import { getMammothItemDef } from "../../inventory/mammothItemCatalog";
import { mammothItemDefSupportsHotbarWaterDrink, waterBottleFillFraction } from "../../inventory/waterContainerHelpers";
import type { Identity } from "spacetimedb";
import { getFpHotbarSelectedSlot } from "../fpHotbar/fpHotbarSelection.js";
import { getHotbarSlotInventoryItem } from "../fpHotbar/fpHotbarResolve.js";

export type FpBalconyGrowSession = {
  dispose: () => void;
  updateFrame: (
    camera: THREE.PerspectiveCamera,
    feet: THREE.Vector3,
    decor: MountFpApartmentDecorMeshesResult,
    unitKey: string | null,
  ) => void;
  tryPrimaryPointerDown: (
    camera: THREE.PerspectiveCamera,
    conn: DbConnection,
    decor: MountFpApartmentDecorMeshesResult,
    feet: THREE.Vector3,
  ) => boolean;
  trySecondaryPointerDown: (camera: THREE.PerspectiveCamera, conn: DbConnection) => boolean;
  getCachedPlacement: () => BalconyGrowPlacementRaycast | null;
  getGrowState: (unitKey: string | null) => BalconyGrowOpUnitState;
  /** Grow state for the player's claimed unit — correct on balcony where containing unit is null. */
  getActiveGrowState: () => BalconyGrowOpUnitState;
};

const _screenCenter = new THREE.Vector2(0, 0);
const _raycaster = new THREE.Raycaster();

function resolveClaimedUnitKey(conn: DbConnection): string | null {
  if (!conn.identity) return null;
  for (const row of conn.db.apartment_unit) {
    if (row.owner && row.owner.toHexString() === conn.identity.toHexString() && row.state === 1) {
      return row.unitKey;
    }
  }
  return null;
}

function stashHasFertilizer(conn: DbConnection, unitKey: string, trayId: string): boolean {
  const key = balconyGrowTrayStashKey(unitKey, trayId);
  for (const row of conn.db.inventory_item) {
    if (row.location.tag !== "Stash") continue;
    if (row.location.value.unitKey !== key) continue;
    if (row.defId === "balcony-grow-substrate") return true;
  }
  return false;
}

const _aimPickScratch: THREE.Mesh[] = [];

export function mountFpBalconyGrowSession(opts: {
  scene: THREE.Scene;
  conn: DbConnection;
  canvas: HTMLCanvasElement;
}): FpBalconyGrowSession {
  const preview = createBalconyGrowSeedPreview(opts.scene);
  const waterVisuals = createBalconyWaterPatchVisuals(opts.scene);
  let cachedPlacement: BalconyGrowPlacementRaycast | null = null;
  let claimedUnitKey: string | null = null;

  return {
    dispose() {
      preview?.dispose();
      waterVisuals.dispose();
      setBalconyGrowInspectTarget(null);
      clearBalconyGrowInspectPresentation();
    },
    getGrowState(unitKey) {
      return readBalconyGrowOpUnitState(opts.conn, unitKey);
    },
    getActiveGrowState() {
      return readBalconyGrowOpUnitState(
        opts.conn,
        claimedUnitKey ?? resolveClaimedUnitKey(opts.conn),
      );
    },
    getCachedPlacement: () => cachedPlacement,
    updateFrame(camera, feet, decor, unitKey) {
      claimedUnitKey = unitKey ?? resolveClaimedUnitKey(opts.conn);
      const growState = readBalconyGrowOpUnitState(opts.conn, claimedUnitKey);

      decor.syncBalconyGrowTrayDecorVisibility(feet, claimedUnitKey);
      decor.collectBalconyGrowPickMeshesForPlayer(feet, _aimPickScratch);
      const hits = [...decor.raycastBalconyGrowTrayHits(feet, camera)];
      cachedPlacement = resolveBalconyGrowPlacement(
        opts.conn,
        opts.conn.identity,
        feet,
        camera,
        hits,
        decor.getGrowTrayPickMeshes(),
        decor.getGrowSlotPickMeshes(),
        growState,
      );
      syncBalconyGrowPlacementPreview(preview, cachedPlacement);
      syncBalconyGrowInspect(hits, growState, camera, opts.canvas, _aimPickScratch);

      decor.syncBalconyGrowSlotVisuals(growState.plants, growState.trays, (uk, tid) =>
        stashHasFertilizer(opts.conn, uk, tid),
      );
      waterVisuals.sync(growState.patches, feet.y, Date.now() * 1000);
    },
    tryPrimaryPointerDown(camera, conn, decor, feet) {
      const growState = readBalconyGrowOpUnitState(conn, claimedUnitKey);
      const hits = [...decor.raycastBalconyGrowTrayHits(feet, camera)];
      const placement =
        resolveBalconyGrowPlacement(
          conn,
          conn.identity,
          feet,
          camera,
          hits,
          decor.getGrowTrayPickMeshes(),
          decor.getGrowSlotPickMeshes(),
          growState,
        ) ?? cachedPlacement;
      if (!placement || !conn.identity) return false;
      const blockedMessage = balconyGrowPlantPrimaryClickBlockedMessage(placement);
      if (blockedMessage) {
        showGameplayErrorBar(blockedMessage);
        return true;
      }
      void conn.reducers.plantBalconyGrowSlot({
        unitKey: placement.unitKey,
        trayId: placement.trayId,
        slotIndex: placement.slotIndex,
        seedDefId: placement.seedDefId,
      });
      return true;
    },
    trySecondaryPointerDown(camera, conn) {
      if (!conn.identity) return false;
      const slot = getFpHotbarSelectedSlot();
      if (slot === null) return false;
      const item = getHotbarSlotInventoryItem(conn, conn.identity, slot);
      const def = getMammothItemDef(item?.defId ?? "");
      if (!item || !mammothItemDefSupportsHotbarWaterDrink(def) || !def?.waterContainer) return false;
      if (
        waterBottleFillFraction(conn, item.instanceId, def.waterContainer.capacityLiters) <=
        0.001
      ) {
        return false;
      }
      _raycaster.setFromCamera(_screenCenter, camera);
      const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hit = new THREE.Vector3();
      if (!_raycaster.ray.intersectPlane(floor, hit)) return false;
      void conn.reducers.dumpWaterFromBottle({ aimX: hit.x, aimZ: hit.z });
      return true;
    },
  };
}

export function balconyGrowPromptFromDecorRaycast(
  conn: DbConnection,
  identity: Identity | undefined,
  feet: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  decor: MountFpApartmentDecorMeshesResult,
  growState: BalconyGrowOpUnitState,
): BalconyGrowTrayPrompt | null {
  if (!identity) return null;
  return decor.getBalconyGrowTrayPrompt(feet, camera, conn, identity, growState);
}

export function handleBalconyGrowKeyE(prompt: BalconyGrowTrayPrompt): boolean {
  if (prompt.kind === "balcony_grow_harvest") {
    return true;
  }
  if (prompt.kind === "balcony_grow_tray") {
    setFpActiveStashPanel({
      stashKey: prompt.stashKey,
      stashLabel: prompt.stashLabel,
      stashKind: APARTMENT_STASH_KIND_GROW_TRAY,
    });
    requestMammothInventoryOpenFromFp();
    return true;
  }
  return false;
}

export function runBalconyGrowHarvest(
  conn: DbConnection,
  prompt: Extract<BalconyGrowTrayPrompt, { kind: "balcony_grow_harvest" }>,
): void {
  void conn.reducers.harvestBalconyGrowSlot({
    unitKey: prompt.unitKey,
    trayId: prompt.trayId,
    slotIndex: prompt.slotIndex,
  });
}

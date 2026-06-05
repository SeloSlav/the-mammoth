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
import {
  readBalconyGrowOpUnitState,
  subscribeBalconyGrowOpTables,
} from "../../inventory/balconyGrowOpState.js";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import { APARTMENT_STASH_KIND_GROW_TRAY } from "../fpApartment/fpApartmentStashKey.js";
import { setFpActiveStashPanel } from "../fpInteraction/fpActiveStashPanel.js";
import { requestMammothInventoryOpenFromFp } from "../fpInteraction/fpInventoryOpenRequest.js";
import { getMammothItemDef } from "../../inventory/mammothItemCatalog";
import {
  mammothItemDefSupportsHotbarWaterDrink,
  waterBottleFillLiters,
} from "../../inventory/waterContainerHelpers";
import { resolveBalconyWaterPourAimXz } from "./fpBalconyGrowWaterPourAim.js";
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
  trySecondaryPointerDown: (
    camera: THREE.PerspectiveCamera,
    conn: DbConnection,
    decor: MountFpApartmentDecorMeshesResult,
    feet: THREE.Vector3,
  ) => boolean;
  getCachedPlacement: () => BalconyGrowPlacementRaycast | null;
  getCachedGrowTrayHits: () => readonly THREE.Intersection[];
  getGrowState: (unitKey: string | null) => BalconyGrowOpUnitState;
  /** Grow state for the player's claimed unit — correct on balcony where containing unit is null. */
  getActiveGrowState: () => BalconyGrowOpUnitState;
  /** Raycast prompt from the latest {@link updateFrame} — use for HUD + KeyE parity. */
  getCachedGrowTrayPrompt: () => BalconyGrowTrayPrompt | null;
};

function resolveClaimedUnitKey(conn: DbConnection): string | null {
  if (!conn.identity) return null;
  for (const row of conn.db.apartment_unit) {
    if (row.owner && row.owner.toHexString() === conn.identity.toHexString() && row.state === 1) {
      return row.unitKey;
    }
  }
  return null;
}

const _aimPickScratch: THREE.Mesh[] = [];
const _emptyHits: THREE.Intersection[] = [];

export function mountFpBalconyGrowSession(opts: {
  scene: THREE.Scene;
  conn: DbConnection;
  canvas: HTMLCanvasElement;
  /** Local client SFX after passing pour checks (`water-pour.wav` via `LocalGameAudio`). */
  onWaterPourRequested?: () => void;
}): FpBalconyGrowSession {
  const preview = createBalconyGrowSeedPreview(opts.scene);
  const waterVisuals = createBalconyWaterPatchVisuals(opts.scene);
  let cachedPlacement: BalconyGrowPlacementRaycast | null = null;
  let cachedGrowTrayPrompt: BalconyGrowTrayPrompt | null = null;
  let cachedGrowTrayHits: THREE.Intersection[] = _emptyHits;
  let claimedUnitKey: string | null = null;
  let ownedClaimedUnitKey = resolveClaimedUnitKey(opts.conn);
  let growStateCache: BalconyGrowOpUnitState | null = null;
  let growStateCacheUnitKey: string | null = null;
  let growStateRevision = 0;
  let growStateCacheRevision = -1;

  const bumpGrowState = (): void => {
    growStateRevision += 1;
  };
  const unsubGrowTables = subscribeBalconyGrowOpTables(opts.conn, bumpGrowState);
  const refreshOwnedClaimedUnitKey = (): void => {
    ownedClaimedUnitKey = resolveClaimedUnitKey(opts.conn);
  };
  opts.conn.db.apartment_unit.onInsert(refreshOwnedClaimedUnitKey);
  opts.conn.db.apartment_unit.onUpdate(refreshOwnedClaimedUnitKey);
  opts.conn.db.apartment_unit.onDelete(refreshOwnedClaimedUnitKey);

  const readCachedGrowState = (unitKey: string | null): BalconyGrowOpUnitState => {
    if (
      growStateCache &&
      growStateCacheUnitKey === unitKey &&
      growStateCacheRevision === growStateRevision
    ) {
      return growStateCache;
    }
    const next = readBalconyGrowOpUnitState(opts.conn, unitKey);
    growStateCache = next;
    growStateCacheUnitKey = unitKey;
    growStateCacheRevision = growStateRevision;
    return next;
  };

  return {
    dispose() {
      unsubGrowTables();
      opts.conn.db.apartment_unit.removeOnInsert(refreshOwnedClaimedUnitKey);
      opts.conn.db.apartment_unit.removeOnUpdate(refreshOwnedClaimedUnitKey);
      opts.conn.db.apartment_unit.removeOnDelete(refreshOwnedClaimedUnitKey);
      preview?.dispose();
      waterVisuals.dispose();
      setBalconyGrowInspectTarget(null);
      clearBalconyGrowInspectPresentation();
    },
    getGrowState(unitKey) {
      return readBalconyGrowOpUnitState(opts.conn, unitKey);
    },
    getActiveGrowState() {
      return readCachedGrowState(claimedUnitKey ?? ownedClaimedUnitKey);
    },
    getCachedPlacement: () => cachedPlacement,
    getCachedGrowTrayHits: () => cachedGrowTrayHits,
    getCachedGrowTrayPrompt: () => cachedGrowTrayPrompt,
    updateFrame(camera, feet, decor, unitKey) {
      claimedUnitKey = unitKey ?? ownedClaimedUnitKey;
      const growState = readCachedGrowState(claimedUnitKey);
      cachedGrowTrayPrompt = null;

      if (decor.getGrowTrayPickMeshes().length === 0) {
        cachedGrowTrayHits = _emptyHits;
        cachedPlacement = null;
        syncBalconyGrowPlacementPreview(preview, null);
        setBalconyGrowInspectTarget(null);
        publishBalconyGrowInspectScreenAnchor(camera, opts.canvas, null);
        waterVisuals.sync(growState.patches, feet.y, Date.now() * 1000);
        return;
      }

      decor.syncBalconyGrowTrayDecorVisibility(feet, claimedUnitKey);
      decor.syncBalconyGrowSlotVisuals(
        growState.plants,
        growState.trays,
        growState.traysWithSubstrate,
      );
      decor.collectBalconyGrowPickMeshesForPlayer(feet, _aimPickScratch, ownedClaimedUnitKey);
      cachedGrowTrayHits = [
        ...decor.raycastBalconyGrowTrayHits(feet, camera, _aimPickScratch),
      ];
      if (opts.conn.identity) {
        cachedGrowTrayPrompt = decor.getBalconyGrowTrayPrompt(
          feet,
          camera,
          opts.conn,
          opts.conn.identity,
          growState,
          cachedGrowTrayHits,
        );
      }
      cachedPlacement = resolveBalconyGrowPlacement(
        opts.conn,
        opts.conn.identity,
        feet,
        camera,
        cachedGrowTrayHits,
        decor.getGrowTrayPickMeshes(),
        decor.getGrowSlotPickMeshes(),
        growState,
      );
      syncBalconyGrowPlacementPreview(preview, cachedPlacement);
      syncBalconyGrowInspect(
        cachedGrowTrayHits,
        growState,
        camera,
        opts.canvas,
        _aimPickScratch,
        decor.getGrowTrayPickMeshes(),
        cachedGrowTrayPrompt,
      );
      waterVisuals.sync(growState.patches, feet.y, Date.now() * 1000);
    },
    tryPrimaryPointerDown(camera, conn, decor, feet) {
      const growState = readCachedGrowState(claimedUnitKey);
      const hits =
        cachedGrowTrayHits.length > 0
          ? cachedGrowTrayHits
          : [...decor.raycastBalconyGrowTrayHits(feet, camera)];
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
    trySecondaryPointerDown(camera, conn, decor, feet) {
      if (!conn.identity) return false;
      const slot = getFpHotbarSelectedSlot();
      if (slot === null) return false;
      const item = getHotbarSlotInventoryItem(conn, conn.identity, slot);
      const def = getMammothItemDef(item?.defId ?? "");
      if (!item || !mammothItemDefSupportsHotbarWaterDrink(def) || !def?.waterContainer) return false;
      const liters = waterBottleFillLiters(conn, item.instanceId);
      if (liters == null || liters <= 0.001) return false;

      const aim = { x: 0, z: 0 };
      if (!resolveBalconyWaterPourAimXz(camera, decor, feet, aim)) {
        return true;
      }

      opts.onWaterPourRequested?.();
      void conn.reducers.dumpWaterFromBottle({ aimX: aim.x, aimZ: aim.z });
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
  const hits = decor.raycastBalconyGrowTrayHits(feet, camera);
  return decor.getBalconyGrowTrayPrompt(feet, camera, conn, identity, growState, hits);
}

export function handleBalconyGrowKeyE(
  conn: DbConnection,
  prompt: BalconyGrowTrayPrompt,
): boolean {
  if (prompt.kind === "balcony_grow_harvest") {
    runBalconyGrowHarvest(conn, prompt);
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

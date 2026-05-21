import * as THREE from "three";
import type { DbConnection } from "../../module_bindings";
import type { MountFpApartmentDecorMeshesResult } from "../fpApartment/fpApartmentDecorMeshes.js";
import {
  FP_APARTMENT_INTERACT_PICK_MAX_RAY_M,
  FP_INTERACTION_PICK_LAYER,
} from "../fpSession/fpSessionConstants.js";
import {
  resolveBalconyGrowPlacementFromRay,
  syncBalconyGrowPlacementPreview,
  balconyGrowSeedPreviewGlbUrl,
  type BalconyGrowPlacementRaycast,
} from "./fpBalconyGrowPlacement.js";
import {
  getBalconyGrowTrayPromptFromHit,
  type BalconyGrowTrayPrompt,
} from "./fpBalconyGrowPrompt.js";
import { createFpWorldPlacementPreview, type FpWorldPlacementPreview } from "../fpPlacement/fpWorldPlacementPreview.js";
import { createBalconyWaterPatchVisuals } from "./fpBalconyGrowWaterPatches.js";
import { setBalconyGrowInspectTarget } from "./fpBalconyGrowInspectState.js";
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
  tryPrimaryPointerDown: (conn: DbConnection) => boolean;
  trySecondaryPointerDown: (camera: THREE.PerspectiveCamera, conn: DbConnection) => boolean;
  getCachedPlacement: () => BalconyGrowPlacementRaycast | null;
  getGrowState: (unitKey: string | null) => BalconyGrowOpUnitState;
};

const _screenCenter = new THREE.Vector2(0, 0);
const _raycaster = new THREE.Raycaster();

function growRayHits(
  camera: THREE.PerspectiveCamera,
  decor: MountFpApartmentDecorMeshesResult,
): THREE.Intersection[] {
  _raycaster.layers.set(FP_INTERACTION_PICK_LAYER);
  _raycaster.setFromCamera(_screenCenter, camera);
  _raycaster.far = FP_APARTMENT_INTERACT_PICK_MAX_RAY_M;
  const picks = [...decor.getGrowTrayPickMeshes(), ...decor.getGrowSlotPickMeshes()];
  const visible = picks.filter((m) => m.visible);
  return _raycaster.intersectObjects(visible, false);
}

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

export function mountFpBalconyGrowSession(opts: {
  scene: THREE.Scene;
  conn: DbConnection;
}): FpBalconyGrowSession {
  let preview: FpWorldPlacementPreview | null = null;
  void createFpWorldPlacementPreview(opts.scene, balconyGrowSeedPreviewGlbUrl()).then((p) => {
    preview = p;
  });
  const waterVisuals = createBalconyWaterPatchVisuals(opts.scene);
  let cachedPlacement: BalconyGrowPlacementRaycast | null = null;
  let claimedUnitKey: string | null = null;

  return {
    dispose() {
      preview?.dispose();
      waterVisuals.dispose();
    },
    getGrowState(unitKey) {
      return readBalconyGrowOpUnitState(opts.conn, unitKey);
    },
    getCachedPlacement: () => cachedPlacement,
    updateFrame(camera, feet, decor, unitKey) {
      claimedUnitKey = unitKey ?? resolveClaimedUnitKey(opts.conn);
      const growState = readBalconyGrowOpUnitState(opts.conn, claimedUnitKey);
      const hits = growRayHits(camera, decor);
      cachedPlacement = resolveBalconyGrowPlacementFromRay(
        opts.conn,
        opts.conn.identity,
        hits,
        growState,
      );
      syncBalconyGrowPlacementPreview(preview, cachedPlacement);

      const slotHit = hits.find((h) => typeof h.object.userData.mammothGrowSlotIndex === "number");
      if (slotHit) {
        setBalconyGrowInspectTarget({
          unitKey: slotHit.object.userData.mammothGrowTrayUnitKey as string,
          trayId: slotHit.object.userData.mammothGrowTrayId as string,
          slotIndex: slotHit.object.userData.mammothGrowSlotIndex as number,
        });
      } else {
        setBalconyGrowInspectTarget(null);
      }

      decor.syncBalconyGrowSlotVisuals(growState.plants, growState.trays, (uk, tid) =>
        stashHasFertilizer(opts.conn, uk, tid),
      );
      waterVisuals.sync(growState.patches, feet.y, Date.now() * 1000);
    },
    tryPrimaryPointerDown(conn) {
      if (!cachedPlacement?.valid || !conn.identity) return false;
      void conn.reducers.plantBalconyGrowSlot({
        unitKey: cachedPlacement.unitKey,
        trayId: cachedPlacement.trayId,
        slotIndex: cachedPlacement.slotIndex,
        seedDefId: cachedPlacement.seedDefId,
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
  const hits = growRayHits(camera, decor);
  for (const hit of hits) {
    const prompt = getBalconyGrowTrayPromptFromHit(conn, identity, feet, hit, growState);
    if (prompt) return prompt;
  }
  return null;
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

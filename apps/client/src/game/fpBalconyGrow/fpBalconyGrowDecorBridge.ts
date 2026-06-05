import * as THREE from "three";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import type { BalconyGrowPlant, BalconyGrowTray } from "../../module_bindings/types";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import type { FpApartmentStashRayOcclusion } from "../fpApartment/fpApartmentStashRayOcclusion.js";
import { maxRaycastHitDistance } from "../fpApartment/fpApartmentStashRayOcclusion.js";
import {
  FP_APARTMENT_INTERACT_PICK_MAX_RAY_M,
  FP_INTERACTION_PICK_LAYER,
} from "../fpSession/fpSessionConstants.js";
import {
  mountGrowTrayDecorOnGroup,
  syncGrowSlotVisuals,
  type GrowTrayDecorMount,
} from "./fpBalconyGrowTrayDecor.js";
import {
  resolveBalconyGrowTrayPrompt,
  type BalconyGrowTrayPrompt,
} from "./fpBalconyGrowPrompt.js";
import {
  collectOwnedBalconyGrowPickMeshes,
  sortBalconyGrowRaycastHits,
} from "./fpBalconyGrowTrayAnchor.js";
import { syncBalconyGrowTrayDecorVisibility } from "./fpBalconyGrowPresentation.js";

export type FpBalconyGrowDecorBridge = {
  clear: () => void;
  mountOnGrowTrayDecorGroup: (opts: {
    decorGroup: THREE.Group;
    unitKey: string;
    trayId: string;
  }) => Promise<void>;
  raycastHits: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    identity: Identity | undefined,
    preCollectedVisiblePicks?: readonly THREE.Mesh[],
  ) => THREE.Intersection[];
  resolvePrompt: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    conn: DbConnection,
    identity: Identity | undefined,
    growState: BalconyGrowOpUnitState,
    hits: readonly THREE.Intersection[],
  ) => BalconyGrowTrayPrompt | null;
  syncSlotVisuals: (
    plants: readonly BalconyGrowPlant[],
    trays: readonly BalconyGrowTray[],
    traysWithSubstrate: ReadonlySet<string>,
  ) => void;
  syncVisibility: (feet: THREE.Vector3, unitKey: string | null) => void;
  collectPickMeshesForPlayer: (
    playerPos: THREE.Vector3,
    identity: Identity | undefined,
    dst: THREE.Mesh[],
    ownedUnitKey?: string | null,
  ) => void;
  getGrowTrayPickMeshes: () => readonly THREE.Mesh[];
  getGrowSlotPickMeshes: () => readonly THREE.Mesh[];
};

export function createFpBalconyGrowDecorBridge(opts: {
  conn: DbConnection;
  stashRayOcclusion: FpApartmentStashRayOcclusion;
  pickGeometry: THREE.BufferGeometry;
  pickMaterial: THREE.Material;
  raycaster: THREE.Raycaster;
  screenCenterNdc: THREE.Vector2;
}): FpBalconyGrowDecorBridge {
  const growTrayPickMeshes: THREE.Mesh[] = [];
  const growTrayCenterPickMeshes: THREE.Mesh[] = [];
  const growSlotPickMeshes: THREE.Mesh[] = [];
  const growPlantPickMeshes: THREE.Mesh[] = [];
  const growSlotVisualsByTrayId = new Map<string, THREE.Group>();
  const visibleGrowPickMeshes: THREE.Mesh[] = [];
  const slotVisualSyncKeyByTrayId = new Map<string, string>();

  const configureInteractionPickRaycaster = (): void => {
    opts.raycaster.layers.disableAll();
    opts.raycaster.layers.enable(FP_INTERACTION_PICK_LAYER);
  };

  return {
    clear() {
      growTrayPickMeshes.length = 0;
      growTrayCenterPickMeshes.length = 0;
      growSlotPickMeshes.length = 0;
      growPlantPickMeshes.length = 0;
      growSlotVisualsByTrayId.clear();
      visibleGrowPickMeshes.length = 0;
      slotVisualSyncKeyByTrayId.clear();
    },
    async mountOnGrowTrayDecorGroup(mountOpts) {
      const mount: GrowTrayDecorMount = await mountGrowTrayDecorOnGroup({
        decorGroup: mountOpts.decorGroup,
        unitKey: mountOpts.unitKey,
        trayId: mountOpts.trayId,
        pickGeometry: opts.pickGeometry,
        pickMaterial: opts.pickMaterial,
      });
      growTrayPickMeshes.push(...mount.growTrayPickMeshes);
      growTrayCenterPickMeshes.push(...mount.growTrayCenterPickMeshes);
      growSlotPickMeshes.push(...mount.growSlotPickMeshes);
      growPlantPickMeshes.push(...mount.growPlantPickMeshes);
      growSlotVisualsByTrayId.set(mountOpts.trayId, mount.slotVisualsGroup);
    },
    raycastHits(playerPos, camera, identity, preCollectedVisiblePicks) {
      let visible: readonly THREE.Mesh[];
      if (preCollectedVisiblePicks) {
        visible = preCollectedVisiblePicks;
      } else {
        collectOwnedBalconyGrowPickMeshes(
          opts.conn,
          identity,
          playerPos,
          growTrayPickMeshes,
          growSlotPickMeshes,
          visibleGrowPickMeshes,
          growPlantPickMeshes,
          growTrayCenterPickMeshes,
        );
        visible = visibleGrowPickMeshes;
      }
      if (visible.length === 0) return [];
      configureInteractionPickRaycaster();
      opts.raycaster.setFromCamera(opts.screenCenterNdc, camera);
      opts.raycaster.far = FP_APARTMENT_INTERACT_PICK_MAX_RAY_M;
      const hits = sortBalconyGrowRaycastHits(
        opts.raycaster.intersectObjects([...visible], false),
      );
      if (hits.length === 0) return hits;
      const nearestWallDistance = opts.stashRayOcclusion.nearestOccluderDistanceAlongViewRay(
        camera,
        maxRaycastHitDistance(hits),
      );
      return hits.filter((hit) => !opts.stashRayOcclusion.hitOccluded(hit, nearestWallDistance));
    },
    resolvePrompt(playerPos, camera, conn, identity, growState, hits) {
      return resolveBalconyGrowTrayPrompt(
        conn,
        identity,
        playerPos,
        camera,
        hits,
        growTrayPickMeshes,
        growSlotPickMeshes,
        growState,
        opts.stashRayOcclusion,
        growTrayCenterPickMeshes,
      );
    },
    syncSlotVisuals(plants, trays, traysWithSubstrate) {
      for (const [trayId, slotGroup] of growSlotVisualsByTrayId) {
        const tray = trays.find((t) => t.trayId === trayId);
        const waterLiters = tray?.waterLiters ?? 0;
        const fertilizerPresent = traysWithSubstrate.has(trayId);
        let plantKey = "";
        for (const plant of plants) {
          if (plant.trayId !== trayId) continue;
          plantKey += `${plant.slotIndex}:${plant.phase}:${plant.daysGrown}:${plant.targetDays}:${plant.cropDefId};`;
        }
        const syncKey = `${waterLiters.toFixed(2)}:${fertilizerPresent ? 1 : 0}:${plantKey}`;
        if (slotVisualSyncKeyByTrayId.get(trayId) === syncKey) continue;
        slotVisualSyncKeyByTrayId.set(trayId, syncKey);
        syncGrowSlotVisuals(
          slotGroup,
          plants,
          trayId,
          waterLiters,
          fertilizerPresent,
        );
      }
    },
    syncVisibility(feet, unitKey) {
      syncBalconyGrowTrayDecorVisibility(feet, unitKey, growSlotVisualsByTrayId);
    },
    collectPickMeshesForPlayer(playerPos, identity, dst, ownedUnitKey) {
      collectOwnedBalconyGrowPickMeshes(
        opts.conn,
        identity,
        playerPos,
        growTrayPickMeshes,
        growSlotPickMeshes,
        dst,
        growPlantPickMeshes,
        growTrayCenterPickMeshes,
        ownedUnitKey,
      );
    },
    getGrowTrayPickMeshes: () => growTrayPickMeshes,
    getGrowSlotPickMeshes: () => growSlotPickMeshes,
  };
}
